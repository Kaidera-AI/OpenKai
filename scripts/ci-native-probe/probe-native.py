#!/usr/bin/env python3
"""Provider-free probe of a PUBLISHED OpenKai native artifact; synthetic fixtures only."""
import argparse, hashlib, json, os, pathlib, platform, subprocess, sys, time

BASE = pathlib.Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--binary', required=True)
parser.add_argument('--case', default='all-disabled')
parser.add_argument('--global-enabled', default='false')
parser.add_argument('--project-enabled', default='false')
args = parser.parse_args()
binary = pathlib.Path(args.binary).resolve()
case = BASE / 'runs' / args.case
case.mkdir(parents=True, exist_ok=False)
fixture = case / 'fixture'
home, project = fixture / 'home', fixture / 'project'
config, agent = home / '.omp', home / '.omp' / 'agent'
for directory in [home, project, project / '.omp', config, agent, fixture / 'tmp']:
    directory.mkdir(parents=True, exist_ok=True)
origins = {
    'NATIVE_DOTENV_HOME': home / '.env',
    'NATIVE_DOTENV_CONFIG': config / '.env',
    'NATIVE_DOTENV_AGENT': agent / '.env',
    'NATIVE_DOTENV_PROJECT': project / '.env',
    'NATIVE_DOTENV_PROJECT_AGENT': project / '.omp' / '.env',
    'NATIVE_DOTENV_LOCAL': project / '.env.local',
    'NATIVE_DOTENV_MODE': project / '.env.production',
    'NATIVE_DOTENV_MODE_LOCAL': project / '.env.production.local',
}
for key, target in origins.items():
    target.write_text(key + '=synthetic_' + key.lower() + '\n')
keys = list(origins) + ['NATIVE_PARENT_SENTINEL']
command = "printf '%s\\n' " + ' '.join('"${' + key + '-}"' for key in keys)
extension = case / 'probe.ts'
extension.write_text('''export default async function (pi) {
  pi.registerProvider('dotenv-probe', {
    baseUrl: 'http://127.0.0.1:1', apiKey: 'synthetic-provider-free-probe', api: 'native-dotenv-probe',
    streamSimple: () => { throw new Error('PROVIDER_ACCESS_DISABLED_BY_NATIVE_DOTENV_PROBE'); },
    models: [{id:'probe', name:'Provider-free fixture', reasoning:false, input:['text'], cost:{input:0,output:0,cacheRead:0,cacheWrite:0}, contextWindow:4096, maxTokens:64}]
  });
  const keys = KEYS;
  const values = Object.fromEntries(keys.map(key => [key, process.env[key] ?? null]));
  const child = await pi.exec('/bin/sh', ['-c', COMMAND], { timeout: 5000 });
  console.log(JSON.stringify({type:'dotenv_native_probe', bunVersion:Bun.version, platform:process.platform, arch:process.arch, values, rawChild:child, execArgv:process.execArgv}));
}
'''.replace('KEYS', json.dumps(keys)).replace('COMMAND', json.dumps(command)))
launch_env = {
    'HOME': str(home), 'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'SHELL': '/bin/sh',
    'TMPDIR': str(fixture / 'tmp'), 'PWD': str(project), 'TERM': 'dumb',
    'XDG_CONFIG_HOME': str(home / '.config'), 'XDG_DATA_HOME': str(home / '.local/share'),
    'XDG_CACHE_HOME': str(home / '.cache'), 'XDG_STATE_HOME': str(home / '.local/state'),
    'NODE_ENV': 'production', 'PI_CONFIG_DIR': '.omp', 'PI_CODING_AGENT_DIR': str(agent),
    'OPENKAI_DOTENV_ENABLED': args.global_enabled,
    'OPENKAI_PROJECT_DOTENV_ENABLED': args.project_enabled,
    'OPENKAI_AUTO_UPDATE_ENABLED': 'false', 'PI_BASH_NO_LOGIN': '1',
    'NATIVE_PARENT_SENTINEL': 'synthetic_parent_value',
}
argv = [str(binary), '--mode', 'rpc', '--no-session', '--no-lsp', '--no-pty', '--no-skills', '--no-rules', '--no-extensions', '--trusted-extension', str(extension)]
request = {'id':'native-dotenv-child', 'type':'bash', 'command':command}
receipt = {'binary':str(binary), 'sha256':hashlib.sha256(binary.read_bytes()).hexdigest(),
    'host':platform.platform(), 'argv':argv, 'launchEnv':launch_env, 'origins':{k:str(v) for k,v in origins.items()},
    'request':request, 'startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
(case / 'invocation.json').write_text(json.dumps(receipt, indent=2)+'\n')
with (case / 'stdout.log').open('w') as out, (case / 'stderr.log').open('w') as err:
    process = subprocess.Popen(argv, cwd=project, env=launch_env, stdin=subprocess.PIPE, stdout=out, stderr=err, text=True)
    process.stdin.write(json.dumps(request)+'\n')
    process.stdin.flush()
    deadline = time.monotonic()+35
    found = False
    while time.monotonic()<deadline and process.poll() is None:
        time.sleep(0.1)
        log = (case / 'stdout.log').read_text()
        if '"id":"native-dotenv-child"' in log and '"type":"response"' in log:
            found = True
            break
    process.stdin.close()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.terminate()
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
records=[]
for line in (case / 'stdout.log').read_text().splitlines():
    try: records.append(json.loads(line))
    except json.JSONDecodeError: pass
snapshot=next((record for record in records if record.get('type')=='dotenv_native_probe'),None)
response=next((record for record in records if record.get('id')=='native-dotenv-child'),None)
result={'case':args.case, 'artifactSha256':receipt['sha256'], 'processExitCode':process.returncode,
    'snapshot':snapshot, 'bashResponse':response, 'completedProbe':snapshot is not None and response is not None,
    'stderr':(case/'stderr.log').read_text()}
result['dotenvAbsentInProcess'] = snapshot is not None and all(snapshot['values'][key] is None for key in origins)
result['parentPreservedInProcess'] = snapshot is not None and snapshot['values']['NATIVE_PARENT_SENTINEL']=='synthetic_parent_value'
shell_output = response.get('data', {}).get('output', '') if response else ''
shell_values = dict(zip(keys, shell_output.splitlines()))
result['bashChildValues'] = shell_values
result['dotenvAbsentInBashChild'] = response is not None and all(shell_values.get(key) == '' for key in origins)
result['parentPreservedInBashChild'] = shell_values.get('NATIVE_PARENT_SENTINEL') == 'synthetic_parent_value'
result['bashSucceeded'] = response is not None and response.get('success') is True and response.get('data', {}).get('exitCode') == 0 and not response.get('data', {}).get('cancelled')
result['leakedProcessOrigins'] = [key for key in origins if snapshot and snapshot['values'].get(key) is not None]
result['leakedBashOrigins'] = [key for key in origins if shell_values.get(key)]
result['verdict'] = 'PASS' if (result['completedProbe'] and result['processExitCode'] == 0 and result['dotenvAbsentInProcess'] and result['dotenvAbsentInBashChild'] and result['parentPreservedInProcess'] and result['parentPreservedInBashChild'] and result['bashSucceeded']) else 'FAIL'
(case / 'result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
sys.exit(0 if result['verdict'] == 'PASS' else 1)
