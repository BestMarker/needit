const db = require('./database');

try {
    db.exec("ALTER TABLE posts ADD COLUMN is_edited INTEGER DEFAULT 0");
    console.log("Added is_edited to posts");
} catch(e) {}

try {
    db.exec("ALTER TABLE comments ADD COLUMN is_edited INTEGER DEFAULT 0");
    console.log("Added is_edited to comments");
} catch(e) {}
