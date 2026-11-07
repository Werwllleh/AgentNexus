import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { dbRepo } from './db.js';
import { validatePrompt, validateToolCommand, logSecurityIncident } from './guardrails.js';
import { engineRegistry } from './engines/engineRegistry.js';

// Map: conversationId -> ActiveSession
// ActiveSession: { conversationId, projectId, child, assistantMessageId, userMessageId, accumulatedText, stepMap, startTime }
const activeSessions = new Map();

// Map: wsClient -> Set of subscribed conversationIds (or ws.conversationId)
let wssInstance = null;

export function setWss(wss) {
  wssInstance = wss;
}

export function broadcast(payload) {
  if (!wssInstance) return;
  const message = JSON.stringify(payload);
  for (const client of wssInstance.clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(message);
    }
  }
}

export function broadcastToConversation(conversationId, payload) {
  if (!wssInstance) return;
  const message = JSON.stringify(payload);
  for (const client of wssInstance.clients) {
    if (client.readyState === 1 && (client.subscribedConversationId === conversationId || !client.subscribedConversationId)) {
      client.send(message);
    }
  }
}

export function getActiveSession(conversationId) {
  return activeSessions.get(conversationId);
}

export function getAllActiveSessionIds() {
  return Array.from(activeSessions.keys());
}

export function stopSession(conversationId) {
  const session = activeSessions.get(conversationId);
  if (!session) return false;

  try {
    session.child.kill('SIGINT');
  } catch (err) {
    console.error('Error killing process:', err);
  }

  dbRepo.updateMessage(session.assistantMessageId, {
    content: session.accumulatedText + '\n\n*(Остановлено пользователем)*',
    status: 'stopped'
  });
  dbRepo.updateConversation(conversationId, { status: 'idle' });

  activeSessions.delete(conversationId);

  broadcastToConversation(conversationId, {
    type: 'stopped',
    conversationId,
    messageId: session.assistantMessageId
  });

  broadcast({
    type: 'project_status',
    projectId: session.projectId,
    status: 'idle',
    conversationId
  });

  return true;
}

export async function startTurn({
  projectId,
  projectPath,
  conversationId,
  prompt,
  engine = 'gemini',
  model = 'auto',
  mode = 'auto',
  effort = 'high',
  clientIp = 'unknown'
}) {
  // Pre-execution Security Guardrail
  const validation = validatePrompt(prompt);
  if (!validation.safe) {
    logSecurityIncident({
      ip: clientIp,
      userId: 'admin',
      prompt,
      category: validation.category,
      reason: validation.reason
    });
    const secErr = new Error(`Безопасность: ${validation.reason}`);
    secErr.isSecurityBlock = true;
    secErr.category = validation.category;
    throw secErr;
  }

  const userMsgId = crypto.randomUUID();
  const assistantMsgId = crypto.randomUUID();
  let actualConversationId = conversationId;

  // If conversationId is provided and exists, update its status
  let existing = null;
  if (actualConversationId) {
    existing = dbRepo.getConversation(actualConversationId);
    if (!existing) {
      dbRepo.createConversation(actualConversationId, projectId, prompt.slice(0, 40) + '...');
    } else {
      dbRepo.updateConversation(actualConversationId, { status: 'running' });
    }
  }

  // Create user message in DB
  if (actualConversationId) {
    dbRepo.createMessage(userMsgId, actualConversationId, 'user', prompt, 'done');
    dbRepo.createMessage(assistantMsgId, actualConversationId, 'assistant', '', 'streaming');
  }

  const engineInstance = engineRegistry.get(engine || 'gemini');
  console.log(`[Session] Spawning ${engineInstance.name} (${engineInstance.id}) for project ${projectId} in ${projectPath}`);

  const child = engineInstance.spawnProcess({
    projectPath,
    prompt,
    mode,
    effort,
    model,
    resumeId: existing?.agy_id
  });

  let lastDbSaveTime = 0;
  const sessionData = {
    conversationId: actualConversationId,
    projectId,
    projectPath,
    prompt,
    engine: engineInstance.id,
    engineInstance,
    clientIp,
    child,
    userMsgId,
    assistantMessageId: assistantMsgId,
    accumulatedText: '',
    stepMap: new Map(),
    startTime: Date.now(),
    persistText(force = false) {
      const now = Date.now();
      if ((force || now - lastDbSaveTime >= 800) && sessionData.conversationId && sessionData.assistantMessageId) {
        lastDbSaveTime = now;
        dbRepo.updateMessage(sessionData.assistantMessageId, {
          content: sessionData.accumulatedText || '',
          status: 'streaming'
        });
      }
    }
  };

  if (actualConversationId) {
    activeSessions.set(actualConversationId, sessionData);
    broadcast({
      type: 'project_status',
      projectId,
      status: 'running',
      conversationId: actualConversationId
    });
  }

  let lineBuffer = '';

  child.stdout.on('data', (chunk) => {
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop(); // keep last incomplete line

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        handleStreamEvent(event, sessionData);
      } catch {
        console.log('[agy raw stdout]:', line);
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    console.error(`[agy stderr ${projectId}]:`, chunk.toString());
  });

  child.on('error', (err) => {
    console.error(`[Session error]`, err);
    if (sessionData.conversationId) {
      const errContent = sessionData.accumulatedText
        ? `${sessionData.accumulatedText}\n\n⚠️ **Ошибка выполнения**: ${err.message}`
        : `⚠️ **Ошибка выполнения**: ${err.message}`;

      dbRepo.updateMessage(sessionData.assistantMessageId, {
        content: errContent,
        status: 'error'
      });
      dbRepo.updateConversation(sessionData.conversationId, { status: 'error', lastError: err.message });
      activeSessions.delete(sessionData.conversationId);
      broadcastToConversation(sessionData.conversationId, {
        type: 'error',
        conversationId: sessionData.conversationId,
        error: err.message
      });
      broadcast({
        type: 'project_status',
        projectId,
        status: 'idle',
        conversationId: sessionData.conversationId
      });
    }
  });

  child.on('close', (code) => {
    console.log(`[Session closed] exit code ${code}`);
    if (lineBuffer.trim()) {
      try {
        const event = JSON.parse(lineBuffer);
        handleStreamEvent(event, sessionData);
      } catch { /* ignore */ }
    }

    if (sessionData.conversationId) {
      const finalContent = sessionData.accumulatedText || (sessionData.stepMap.size > 0 ? 'Действия успешно выполнены.' : 'Сессия завершена.');
      dbRepo.updateMessage(sessionData.assistantMessageId, {
        content: finalContent,
        status: 'done'
      });
      dbRepo.updateConversation(sessionData.conversationId, { status: 'idle' });

      activeSessions.delete(sessionData.conversationId);

      broadcastToConversation(sessionData.conversationId, {
        type: 'done',
        conversationId: sessionData.conversationId,
        messageId: sessionData.assistantMessageId,
        finalContent
      });

      broadcast({
        type: 'project_status',
        projectId,
        status: 'idle',
        conversationId: sessionData.conversationId
      });
    }
  });

  return {
    conversationId: actualConversationId,
    assistantMessageId: assistantMsgId,
    userMessageId: userMsgId
  };
}

function handleStreamEvent(event, session) {
  const convId = session.conversationId;
  if (!convId) return;

  // Non-Gemini Engine Normalization (Claude Code / OpenAI)
  if (session.engineInstance && session.engineInstance.id !== 'gemini') {
    const norm = session.engineInstance.normalizeEvent(event);
    if (!norm) return;

    if (norm.type === 'init' && norm.conversationId) {
      dbRepo.updateConversation(convId, { agyId: norm.conversationId });
      broadcastToConversation(convId, {
        type: 'init',
        conversationId: convId,
        tools: norm.tools || []
      });
      return;
    }

    if (norm.type === 'text_delta') {
      session.accumulatedText += norm.delta;
      session.persistText?.();
      broadcastToConversation(convId, {
        type: 'text_delta',
        conversationId: convId,
        messageId: session.assistantMessageId,
        delta: norm.delta,
        fullContent: session.accumulatedText
      });
      return;
    }

    if (norm.type === 'tool_update') {
      const stepKey = `step_${norm.stepIndex || 1}`;
      const existingStep = session.stepMap.get(stepKey) || {
        id: crypto.randomUUID(),
        stepIndex: norm.stepIndex || 1,
        stepType: 'tool',
        toolName: norm.toolName,
        toolParams: norm.toolParams || null,
        toolOutput: norm.toolOutput || null,
        status: norm.status || 'active'
      };
      if (norm.status === 'done') existingStep.status = 'done';
      if (norm.toolOutput) existingStep.toolOutput = norm.toolOutput;
      session.stepMap.set(stepKey, existingStep);

      dbRepo.upsertStep({
        id: existingStep.id,
        messageId: session.assistantMessageId,
        stepIndex: existingStep.stepIndex,
        stepType: existingStep.stepType,
        toolName: existingStep.toolName,
        toolParams: existingStep.toolParams,
        toolOutput: existingStep.toolOutput,
        status: existingStep.status
      });

      broadcastToConversation(convId, {
        type: 'tool_update',
        conversationId: convId,
        messageId: session.assistantMessageId,
        step: existingStep
      });
      return;
    }

    if (norm.type === 'result') {
      if (!session.accumulatedText && norm.finalText) {
        session.accumulatedText = norm.finalText;
      }
      return;
    }

    if (norm.type === 'error') {
      session.accumulatedText += `\n\n⚠️ **[${session.engineInstance.name}]**: ${norm.error}`;
      broadcastToConversation(convId, {
        type: 'text_delta',
        conversationId: convId,
        messageId: session.assistantMessageId,
        delta: norm.error,
        fullContent: session.accumulatedText
      });
      return;
    }
    return;
  }

  // 1. Init event (Gemini)
  if (event.event === 'init') {
    const cid = event.conversation_id;
    if (cid && session.conversationId) {
      dbRepo.updateConversation(session.conversationId, { agyId: cid });
    }

    if (!session.conversationId) {
      session.conversationId = cid;
      activeSessions.set(cid, session);

      // Create conversation in DB
      const title = session.prompt
        ? (session.prompt.length > 40 ? session.prompt.slice(0, 40) + '...' : session.prompt)
        : 'Диалог ' + new Date().toLocaleTimeString();
      dbRepo.createConversation(cid, session.projectId, title);
      dbRepo.createMessage(session.userMsgId, cid, 'user', session.prompt || 'Промпт', 'done');
      dbRepo.createMessage(session.assistantMessageId, cid, 'assistant', '', 'streaming');
      dbRepo.updateConversation(cid, { status: 'running', agyId: cid });

      broadcast({
        type: 'conversation_created',
        conversationId: cid,
        projectId: session.projectId
      });
    }

    broadcastToConversation(session.conversationId, {
      type: 'init',
      conversationId: session.conversationId,
      tools: event.init?.tools || []
    });
    return;
  }

  // 2. Step update event
  if (event.event === 'step_update' && event.step_update) {
    const su = event.step_update;

    // Agent response text delta
    if (su.step_type === 'agent_response') {
      if (su.text_delta) {
        session.accumulatedText += su.text_delta;
        session.persistText?.();
        // Broadcast token delta to UI
        broadcastToConversation(convId, {
          type: 'text_delta',
          conversationId: convId,
          messageId: session.assistantMessageId,
          delta: su.text_delta,
          fullContent: session.accumulatedText
        });
      } else if (su.state === 'ACTIVE') {
        broadcastToConversation(convId, {
          type: 'agent_thinking',
          conversationId: convId,
          messageId: session.assistantMessageId
        });
      }

      if (su.state === 'DONE') {
        session.persistText?.(true);
      }
    }

    // Tool execution
    if (su.step_type === 'tool') {
      // Real-time tool command safety inspection
      if (su.tool_name === 'run_command') {
        const cmd = su.tool_info?.parameters?.CommandLine;
        const toolCheck = validateToolCommand(cmd);
        if (!toolCheck.safe) {
          console.warn(`[SECURITY CRITICAL] Terminating process, blocked tool command: ${cmd}`);
          logSecurityIncident({
            ip: session.clientIp || 'unknown',
            userId: 'admin',
            prompt: cmd,
            category: 'dangerous_tool_command',
            reason: toolCheck.reason
          });
          try {
            session.child.kill('SIGKILL');
          } catch { /* ignore */ }

          session.accumulatedText += `\n\n⛔ **[СИСТЕМА БЕЗОПАСНОСТИ]** Команда заблокирована: попытка выполнить опасную операцию (${cmd}).`;
          dbRepo.updateMessage(session.assistantMessageId, {
            content: session.accumulatedText,
            status: 'stopped'
          });
          dbRepo.updateConversation(convId, { status: 'idle' });
          activeSessions.delete(convId);

          broadcastToConversation(convId, {
            type: 'stopped',
            conversationId: convId,
            messageId: session.assistantMessageId,
            securityAlert: toolCheck.reason
          });
          return;
        }
      }

      const stepKey = `step_${su.step_index}`;
      const existingStep = session.stepMap.get(stepKey) || {
        id: crypto.randomUUID(),
        stepIndex: su.step_index,
        stepType: 'tool',
        toolName: su.tool_name,
        toolParams: su.tool_info?.parameters || null,
        toolOutput: su.tool_info?.output || null,
        status: su.state === 'DONE' ? 'done' : 'active',
        durationSeconds: su.duration_seconds || null
      };

      if (su.tool_info?.parameters) {
        existingStep.toolParams = su.tool_info.parameters;
      }

      if (su.state === 'DONE') {
        existingStep.status = 'done';
        if (su.tool_info?.output) existingStep.toolOutput = su.tool_info.output;
        if (su.duration_seconds) existingStep.durationSeconds = su.duration_seconds;
      }

      session.stepMap.set(stepKey, existingStep);

      // Persist step to DB
      dbRepo.upsertStep({
        id: existingStep.id,
        messageId: session.assistantMessageId,
        stepIndex: existingStep.stepIndex,
        stepType: existingStep.stepType,
        toolName: existingStep.toolName,
        toolParams: existingStep.toolParams,
        toolOutput: existingStep.toolOutput,
        status: existingStep.status,
        durationSeconds: existingStep.durationSeconds
      });

      // Broadcast tool update to UI
      broadcastToConversation(convId, {
        type: 'tool_update',
        conversationId: convId,
        messageId: session.assistantMessageId,
        step: existingStep
      });
    }
    return;
  }

  // 3. Result event
  if (event.event === 'result') {
    const res = event.result;
    if (res?.response && !session.accumulatedText) {
      session.accumulatedText = res.response;
    }

    const finalContent = session.accumulatedText || (session.stepMap.size > 0 ? 'Действия успешно выполнены.' : 'Сессия завершена.');
    dbRepo.updateMessage(session.assistantMessageId, {
      content: finalContent,
      status: 'done'
    });
    dbRepo.updateConversation(convId, { status: 'idle' });

    broadcastToConversation(convId, {
      type: 'result',
      conversationId: convId,
      messageId: session.assistantMessageId,
      result: res
    });
  }
}
