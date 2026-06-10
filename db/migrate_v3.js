const db = require('./database');

try {
    db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT");
    console.log("Added avatar_url");
} catch(e) {}

try {
    db.exec("ALTER TABLE users ADD COLUMN avatar_config TEXT");
    console.log("Added avatar_config");
} catch(e) {}

try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            award_type TEXT NOT NULL,
            count INTEGER DEFAULT 0,
            FOREIGN KEY(user_id) REFERENCES users(id),
            UNIQUE(user_id, award_type)
        )
    `);
    console.log("Added user_inventory");
} catch(e) {
    console.error(e);
}
