require('dotenv').config();
process.env.SERVICE_ROLE=process.argv[2]||process.env.SERVICE_ROLE||'standalone';
require('../server');
