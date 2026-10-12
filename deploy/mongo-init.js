// Runs only for a new product volume. The application cannot administer MongoDB.
db = db.getSiblingDB('orchestrai');
db.createUser({user: 'chat', pwd: process.env.MONGO_CHAT_PASSWORD,
  roles: [{role: 'readWrite', db: 'orchestrai'}]});
