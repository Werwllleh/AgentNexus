import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECTS_FILE = path.resolve(__dirname, '../data/projects.json');

function loadProjects() {
  if (!fs.existsSync(PROJECTS_FILE)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));
  } catch (err) {
    console.error('Error reading projects.json:', err.message);
    return [];
  }
}

function saveProjects(projects) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf-8');
}

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === 'list') {
  const projects = loadProjects();
  console.log(`\nConfigured projects (${projects.length}):\n`);
  for (const p of projects) {
    console.log(`- [${p.id}] ${p.name}`);
    console.log(`  Path: ${p.path}`);
    if (p.description) console.log(`  Desc: ${p.description}`);
    console.log('');
  }
  process.exit(0);
}

if (command === 'add') {
  const [, id, name, projPath, description] = args;
  if (!id || !name || !projPath) {
    console.error('Usage: node manageProjects.js add <id> <name> <absolute_path> [description]');
    process.exit(1);
  }

  const resolvedPath = path.resolve(projPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: Path does not exist on filesystem: ${resolvedPath}`);
    process.exit(1);
  }

  const projects = loadProjects();
  const existingIdx = projects.findIndex((p) => p.id === id);
  const entry = {
    id,
    name,
    path: resolvedPath,
    description: description || ''
  };

  if (existingIdx >= 0) {
    projects[existingIdx] = entry;
    console.log(`Updated project [${id}]`);
  } else {
    projects.push(entry);
    console.log(`Added project [${id}]`);
  }

  saveProjects(projects);
  process.exit(0);
}

if (command === 'remove') {
  const [, id] = args;
  if (!id) {
    console.error('Usage: node manageProjects.js remove <id>');
    process.exit(1);
  }

  let projects = loadProjects();
  const initialLen = projects.length;
  projects = projects.filter((p) => p.id !== id);

  if (projects.length === initialLen) {
    console.log(`Project [${id}] not found.`);
  } else {
    saveProjects(projects);
    console.log(`Removed project [${id}].`);
  }
  process.exit(0);
}

console.log('Commands: list, add, remove');
