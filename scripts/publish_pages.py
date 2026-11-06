"""Publish committed dist/ to gh-pages using ordinary Git (no subtree extension)."""
import subprocess

def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()

if git('status','--porcelain'):
    raise SystemExit('Commit working-tree changes before publishing.')
git('push','origin','main')
remote = git('ls-remote','--heads','origin','gh-pages')
parents = []
if remote:
    git('fetch','origin','gh-pages')
    parents = ['-p', git('rev-parse','FETCH_HEAD')]
commit = git('commit-tree',git('rev-parse','HEAD:dist'),*parents,'-m','Deploy Roadster GitHub Pages')
git('push','origin',commit+':refs/heads/gh-pages')
print('Uploaded. GitHub Pages source: gh-pages / (root).')
