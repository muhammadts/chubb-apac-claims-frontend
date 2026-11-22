const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const target = process.env.CLAIMS_API_TARGET || 'http://localhost:5289';
if (!/^https?:\/\//i.test(target)) {
  throw new Error('CLAIMS_API_TARGET must be an http:// or https:// URL');
}

module.exports = [
  {
    context: ['/api'],
    target,
    secure: false,
    changeOrigin: true,
    logLevel: 'warn',
    pathRewrite: { '^/api/health$': '/health' },
  },
];
