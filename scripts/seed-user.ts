import { Pool } from "pg";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";

const EMAIL = process.argv[2] ?? "test@example.com";
const PASSWORD = process.argv[3] ?? "password123";
const ROLE = (process.argv[4] as "admin" | "user") ?? "user";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/quality";

const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const id = randomUUID();

  await pool.query(
    `INSERT INTO users (id, email, user_name, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role
     RETURNING id, email, role`,
    [id, EMAIL.toLowerCase().trim(), "Test User", hash, ROLE],
  );

  const { rows } = await pool.query("SELECT id, email, role FROM users WHERE email = $1", [
    EMAIL.toLowerCase().trim(),
  ]);

  console.log("✅ User seeded:");
  console.log("   id:    ", rows[0].id);
  console.log("   email: ", rows[0].email);
  console.log("   role:  ", rows[0].role);
  console.log("   pass:  ", PASSWORD);
  console.log("   db:    ", DATABASE_URL.replace(/:[^:@]+@/, ":***@"));

  await pool.end();
}

main().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
