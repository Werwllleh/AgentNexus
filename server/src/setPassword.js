import { setPassword, initAuth } from './auth.js';

const newPass = process.argv[2];

if (!newPass) {
  console.log('Usage: node server/src/setPassword.js <new_password>');
  process.exit(1);
}

if (newPass.length < 6) {
  console.error('Error: Password must be at least 6 characters long.');
  process.exit(1);
}

try {
  setPassword(newPass);
  console.log('Password successfully set and hashed!');
  process.exit(0);
} catch (err) {
  console.error('Failed to set password:', err.message);
  process.exit(1);
}
