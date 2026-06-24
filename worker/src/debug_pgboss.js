const PgBoss = require('pg-boss');
console.log('PgBoss type:', typeof PgBoss);
console.log('PgBoss exports:', PgBoss);
console.log('Is Constructor?', typeof PgBoss === 'function' && /class/.test(PgBoss.toString()));
