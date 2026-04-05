import pkg from 'pg';
const { Client } = pkg;

// Supabase database connection
// Using pooled connection for better reliability
// ⚠️ Connection string .env dosyasından okunur, güvenlik için hardcoded KULLANMAYIN
const connectionString = process.env.DATABASE_URL || '';\nif (!connectionString) {\n  console.error('❌ DATABASE_URL environment variable is not set. Use: DATABASE_URL=postgresql://... node setup.js');\n  process.exit(1);\n}

const client = new Client({
  connectionString: connectionString,
});

async function createTables() {
  try {
    await client.connect();
    console.log('Connected to Supabase database');

    // Create packages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS packages (
        id TEXT PRIMARY KEY,
        kasaId TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT,
        adultPrice NUMERIC,
        childPrice NUMERIC,
        currency TEXT DEFAULT 'TRY'
      );
    `);
    console.log('packages table created');

    // Create personnel table
    await client.query(`
      CREATE TABLE IF NOT EXISTS personnel (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        fullName TEXT NOT NULL,
        kasaId TEXT NOT NULL,
        role TEXT NOT NULL,
        weeklyTargetHours NUMERIC DEFAULT 40,
        isActive BOOLEAN DEFAULT true,
        createdAt TIMESTAMP DEFAULT NOW(),
        updatedAt TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('personnel table created');

    // Create sales table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        kasaId TEXT NOT NULL,
        personnelId TEXT,
        packageId TEXT,
        quantity INTEGER DEFAULT 1,
        totalAmount NUMERIC NOT NULL,
        currency TEXT DEFAULT 'TRY',
        createdAt TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('sales table created');

    // Create cross_sales table
    await client.query(`
      CREATE TABLE IF NOT EXISTS cross_sales (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        kasaId TEXT NOT NULL,
        personnelId TEXT,
        items JSONB NOT NULL,
        totalAmount NUMERIC NOT NULL,
        currency TEXT DEFAULT 'TRY',
        createdAt TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('cross_sales table created');

    console.log('All tables created successfully!');
  } catch (error) {
    console.error('Error creating tables:', error);
  } finally {
    await client.end();
  }
}

createTables();