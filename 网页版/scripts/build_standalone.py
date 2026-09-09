"""将当前网页及原始附件打包为可离线分享的单个 HTML。"""
from pathlib import Path
import base64
import json
import re

root = Path(__file__).resolve().parents[1]
html = (root / 'index.html').read_text()
# 战斗页需要独立文件；图谱单文件不保留无法离线访问的跳转。
html = re.sub(r'<a data-battle-link[^>]*>.*?</a>', '', html)
css = (root / 'styles.css').read_text()
assert '</style' not in css.lower()
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="graph-data.js" defer></script><script src="app.js" defer></script>', '')
html = html.replace('href="./index.html"', 'href="#"')
attachments = []
for filename, mime in [('交互关系.pdf', 'application/pdf'), ('新数值.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')]:
    attachments.append({'name': filename, 'mime': mime, 'base64': base64.b64encode((root/'source'/filename).read_bytes()).decode('ascii')})
    html = html.replace(f'href="source/{filename}"', f'href="#" data-attachment="{filename}"')
bootstrap = '''
(() => {
  const attachments = ATTACHMENTS;
  for (const attachment of attachments) {
    const bytes = Uint8Array.from(atob(attachment.base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], {type: attachment.mime}));
    for (const link of document.querySelectorAll('[data-attachment]')) {
      if (link.dataset.attachment !== attachment.name) continue;
      link.href = url;
      if (link.hasAttribute('download')) link.download = attachment.name;
    }
  }
})();
'''.replace('ATTACHMENTS', json.dumps(attachments, ensure_ascii=False))
scripts = '\n'.join((root/f).read_text() for f in ['graph-data.js', 'app.js']) + bootstrap
# 防止数据中的 HTML 结束标签截断内联脚本。
scripts = re.sub(r'</script', r'<\\/script', scripts, flags=re.I)
html = html.replace('</body>', '<script>\n' + scripts + '\n</script>\n</body>')
output = root / '交互关系_单文件分享版.html'
output.write_text(html)
print(f'{output}\n{output.stat().st_size:,} bytes')
