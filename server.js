const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8004;

http.createServer((req, res) => {
    // Determine file path (defaults to index.html)
    let filePath = '.' + (req.url === '/' ? '/index.html' : req.url);
    const extname = path.extname(filePath);
    
    // Basic MIME types so the browser knows what it's reading
    const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404);
            res.end('File not found');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}).listen(PORT);

console.log(`Server running at http://localhost:${PORT}/`);