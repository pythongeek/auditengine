import zipfile
import xml.etree.ElementTree as ET
import sys
import os
import re

ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

def extract_text(docx_path):
    with zipfile.ZipFile(docx_path) as zf:
        with zf.open('word/document.xml') as f:
            tree = ET.parse(f)
    root = tree.getroot()
    paragraphs = []
    for p in root.findall('.//w:p', ns):
        texts = [t.text for t in p.findall('.//w:t', ns) if t.text]
        if texts:
            paragraphs.append(''.join(texts))
    return '\n'.join(paragraphs)

if __name__ == '__main__':
    docs_dir = sys.argv[1] if len(sys.argv) > 1 else 'docs'
    out_dir = sys.argv[2] if len(sys.argv) > 2 else 'docs-extracted'
    os.makedirs(out_dir, exist_ok=True)
    for fn in sorted(os.listdir(docs_dir)):
        if fn.lower().endswith('.docx'):
            path = os.path.join(docs_dir, fn)
            text = extract_text(path)
            out_path = os.path.join(out_dir, fn.replace('.docx', '.txt').replace(' ', '_'))
            with open(out_path, 'w', encoding='utf-8') as f:
                f.write(text)
            print(f'Extracted {fn} -> {out_path} ({len(text)} chars)')
