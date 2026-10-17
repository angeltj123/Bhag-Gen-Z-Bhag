# Rebuilds public/index.html from the game source (src/game.html) + client-connector.js
import sys
src = sys.argv[1] if len(sys.argv) > 1 else 'src/game.html'
game = open(src).read()
conn = open('client-connector.js').read()
head = '''<!doctype html>
<html lang="hi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Bhaag Gen-Z Bhaag: a 5,000 m protest march through Delhi to Jantar Mantar. Collect tirangas, chant slogans, dodge lathis and race your friends live.">
<meta name="theme-color" content="#1b0e38">
<meta property="og:title" content="Bhaag Gen-Z Bhaag">
<meta property="og:description" content="Run the 5,000 m march to Jantar Mantar. Race your friends live or beat their ghosts.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 20'%3E%3Crect width='30' height='20' fill='%23fff'/%3E%3Crect width='30' height='6.67' fill='%23ff9933'/%3E%3Crect y='13.33' width='30' height='6.67' fill='%23138808'/%3E%3Ccircle cx='15' cy='10' r='2.6' fill='none' stroke='%23000080'/%3E%3C/svg%3E">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);box-sizing:border-box}body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
'''
i = game.index('<script>')
pre, post = game[:i], game[i:]
b = pre.index('<div class="app">')
headpart = pre[:b].replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
doc = head + headpart + '</head>\n<body>\n' + pre[b:] + '<script>\n' + conn + '\n</script>\n' + post + '\n</body>\n</html>\n'
open('public/index.html', 'w').write(doc)
print('built public/index.html', len(doc), 'bytes')
