const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function extractRealPrompts(options = {}) {
	const {
		claudeSessionsDir = path.join(process.env.HOME, '.claude/projects'),
		minLength = 10,
		maxLength = 5000,
		limit = 200
	} = options;

	if (!fs.existsSync(claudeSessionsDir)) {
		return [];
	}

	const prompts = [];
	const visited = new Set();

	function walkDir(dir) {
		try {
			const entries = fs.readdirSync(dir);
			for (const entry of entries) {
				const fullPath = path.join(dir, entry);
				const stat = fs.statSync(fullPath);
				if (stat.isDirectory()) {
					walkDir(fullPath);
				} else if (entry.endsWith('.jsonl')) {
					processJsonlFile(fullPath);
				}
			}
		} catch (e) {
			// skip inaccessible dirs
		}
	}

	function processJsonlFile(filePath) {
		try {
			const content = fs.readFileSync(filePath, 'utf-8');
			const lines = content.split('\n').filter(l => l.trim());

			for (const line of lines) {
				if (prompts.length >= limit) break;

				try {
					const obj = JSON.parse(line);
					const msg = obj.message || {};
					const role = msg.role || obj.role;

					// Extract user messages (prompts)
					if (role === 'user') {
						let text = extractText(msg.content);
						if (text && text.length >= minLength && text.length <= maxLength) {
							const hash = crypto.createHash('sha256')
								.update(text)
								.digest('hex')
								.slice(0, 12);

							if (!visited.has(hash)) {
								visited.add(hash);
								prompts.push({
									hash,
									length: text.length,
									timestamp: obj.timestamp || new Date().toISOString(),
									project: path.basename(path.dirname(filePath)),
									// NO text stored
								});
							}
						}
					}
				} catch (e) {
					// skip unparseable lines
				}
			}
		} catch (e) {
			// skip unreadable files
		}
	}

	function extractText(content) {
		if (typeof content === 'string') {
			return content.trim();
		}
		if (Array.isArray(content)) {
			return content
				.filter(c => typeof c === 'object' && c !== null)
				.map(c => c.text || '')
				.join(' ')
				.trim();
		}
		return '';
	}

	walkDir(claudeSessionsDir);
	return prompts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

module.exports = { extractRealPrompts };
