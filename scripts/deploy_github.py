"""Run from the extracted project: python3 scripts/deploy_github.py.
Requires Git and GitHub CLI. Credentials stay with gh; never paste a token here.
Publishes this project to the explicitly named repository without force-pushing.
"""
from pathlib import Path
import json, shutil, subprocess, sys, time
ROOT=Path(__file__).resolve().parents[1]
REPO='leejuhan-1214/roadster'
URL='https://leejuhan-1214.github.io/roadster/'

def run(args,check=True,input=None):
    p=subprocess.run(args,cwd=ROOT,input=input,text=True,capture_output=True)
    if check and p.returncode:
        print(p.stderr or p.stdout);raise SystemExit(p.returncode)
    return p

def git(*args):return run(['git',*args]).stdout.strip()
def api(path,method='GET',body=None,check=True):
    args=['gh','api',path,'--method',method]
    if body is not None:args+=['--input','-']
    return run(args,check,input=json.dumps(body) if body is not None else None)

for tool in ['git','gh']:
    if not shutil.which(tool):
        raise SystemExit(f'{tool} is required. Install Git and GitHub CLI (https://cli.github.com), then rerun.')
if run(['gh','auth','status'],False).returncode:
    subprocess.run(['gh','auth','login','--hostname','github.com','--git-protocol','https','--web'],cwd=ROOT,check=True)
profile=json.loads(api('user').stdout)
if profile['login'].lower()!='leejuhan-1214':
    raise SystemExit('Sign in to leejuhan-1214 using gh auth switch/login, then rerun.')
repo=api('repos/'+REPO,check=False)
if repo.returncode:raise SystemExit('Repository access failed. Confirm roadster exists and your local GitHub login can write it.')
if not json.loads(repo.stdout).get('permissions',{}).get('push'):
    raise SystemExit('This account does not have push permission.')
if not (ROOT/'.git').exists():
    git('init','-b','main')
    git('config','user.name','leejuhan-1214')
    git('config','user.email','leejuhan-1214@users.noreply.github.com')
    git('add','.')
    git('commit','-m','Publish Roadster physics simulator')
if git('status','--porcelain'):
    raise SystemExit('Commit your local changes before deploying.')
if 'origin' not in git('remote').splitlines():git('remote','add','origin','https://github.com/'+REPO+'.git')
origin=git('remote','get-url','origin')
if origin not in ['https://github.com/'+REPO+'.git','https://github.com/'+REPO,'git@github.com:'+REPO+'.git']:
    raise SystemExit('Existing origin points elsewhere; review it before deploying.')
# Per-command helper, without changing global Git settings or exposing credentials.
def remote_git(*args):return git('-c','credential.helper=!gh auth git-credential',*args)
remote_git('push','-u','origin','main')
parents=[]
if remote_git('ls-remote','--heads','origin','gh-pages'):
    remote_git('fetch','origin','gh-pages');parents=['-p',git('rev-parse','FETCH_HEAD')]
sha=git('commit-tree',git('rev-parse','main:dist'),*parents,'-m','Deploy Roadster GitHub Pages')
remote_git('push','origin',sha+':refs/heads/gh-pages')
page=api('repos/'+REPO+'/pages',check=False)
method='POST' if page.returncode else 'PUT'
configured=api('repos/'+REPO+'/pages',method,{'source':{'branch':'gh-pages','path':'/'}},check=False)
if configured.returncode:
    print('Code uploaded. Automatic Pages configuration was rejected.')
    print('Open https://github.com/'+REPO+'/settings/pages')
    print('Select Deploy from a branch, gh-pages, / (root), Save.')
    raise SystemExit(1)
print('Pages configured; waiting for GitHub to finish building.')
for _ in range(36):
    page=api('repos/'+REPO+'/pages',check=False)
    if not page.returncode:
        status=json.loads(page.stdout).get('status')
        if status=='built':print('Deployment complete: '+URL);break
        if status=='errored':raise SystemExit('Pages build failed. Check repository Actions / Pages settings.')
    time.sleep(5)
else:print('Build still pending. Check '+URL+' shortly.')
