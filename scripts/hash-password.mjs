import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.mjs "your-password"');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);

// Next.js expands $VAR when loading .env, which would silently blank out an
// unescaped bcrypt hash. Print the .env-ready form to save a debugging session.
console.log(`ADMIN_PASSWORD_HASH="${hash.replaceAll('$', '\\$')}"`);
