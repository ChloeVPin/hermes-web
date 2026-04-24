import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BRIDGE_HOST = process.env.BRIDGE_HOST || '127.0.0.1';
const BRIDGE_PORT = process.env.BRIDGE_PORT || '9120';
const FRONTEND_HOST = process.env.VITE_HOST || '127.0.0.1';
const FRONTEND_PORT = process.env.VITE_PORT || '5173';

// Kill any stale process on the ports we need before starting
function cleanupPort(port) {
  try {
    const pids = execSync(`lsof -ti:${port} 2>/dev/null`, { encoding: 'utf-8' }).trim();
    if (pids) {
      console.log(`🧹 Killing stale process(es) on port ${port}: ${pids}`);
      execSync(`kill -9 ${pids} 2>/dev/null`);
      // Brief pause for OS to release the port
      execSync('sleep 0.5');
    }
  } catch (e) {
    // No process on port, fine
  }
}

// Find hermes-agent directory
function findHermesAgentDir() {
  const candidates = [
    path.join(__dirname, '../hermes-agent'),
    path.join(__dirname, '../../hermes-agent'),
    path.join(process.env.HOME, 'hermes-agent'),
    path.join(process.env.HOME, 'src/hermes-agent'),
  ];
  
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'tui_gateway'))) {
        return dir;
      }
    } catch (e) {
      // Continue
    }
  }
  return null;
}

// Check if hermes-agent has API key configured
function checkApiKey() {
  const hermesAgentDir = process.env.HERMES_AGENT_DIR || findHermesAgentDir();
  
  if (!hermesAgentDir) {
    console.error('❌ hermes-agent not found');
    return false;
  }
  
  const envFile = path.join(process.env.HOME, '.hermes', '.env');
  
  if (!fs.existsSync(envFile)) {
    console.error('❌ No ~/.hermes/.env file found');
    console.error('\nPlease configure hermes-agent with an API key:');
    console.error('Option 1 (recommended):');
    console.error('  mkdir -p ~/.hermes');
    console.error('  echo "OPENROUTER_API_KEY=your-key" >> ~/.hermes/.env');
    console.error('\nOption 2 (use Python venv):');
    console.error(`  cd ${hermesAgentDir}`);
    console.error('  source venv/bin/activate');
    console.error('  python -m hermes model');
    console.error('\nOption 3 (set environment variable):');
    console.error('  export OPENROUTER_API_KEY="your-key"');
    console.error('  mkdir -p ~/.hermes');
    console.error('  echo "OPENROUTER_API_KEY=$OPENROUTER_API_KEY" >> ~/.hermes/.env');
    return false;
  }
  
  const envContent = fs.readFileSync(envFile, 'utf-8');
  const hasApiKey = envContent.match(/(OPENROUTER_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY)=/);
  
  if (!hasApiKey) {
    console.error('❌ No API key found in ~/.hermes/.env');
    console.error('\nPlease add an API key to ~/.hermes/.env:');
    console.error('  echo "OPENROUTER_API_KEY=your-key" >> ~/.hermes/.env');
    return false;
  }
  
  return true;
}

// Start the bridge
async function startBridge() {
  const hermesAgentDir = process.env.HERMES_AGENT_DIR || findHermesAgentDir();
  
  if (!hermesAgentDir) {
    console.error('❌ hermes-agent not found. Set HERMES_AGENT_DIR or clone hermes-agent.');
    process.exit(1);
  }
  
  console.log(`🔌 Starting bridge (hermes-agent: ${hermesAgentDir})`);
  
  const bridgePath = path.join(__dirname, '../bridge/server.py');
  const python = process.env.HERMES_PYTHON || 'python3';
  
  const bridge = spawn(python, [bridgePath], {
    cwd: __dirname,
    env: {
      ...process.env,
      HERMES_AGENT_DIR: hermesAgentDir,
      BRIDGE_HOST,
      BRIDGE_PORT,
    },
    stdio: 'inherit',
  });
  
  bridge.on('error', (err) => {
    console.error('❌ Bridge failed to start:', err.message);
    process.exit(1);
  });
  
  bridge.on('exit', (code) => {
    console.log(`Bridge exited with code ${code}`);
    process.exit(code);
  });
  
  return bridge;
}

// Start the frontend
async function startFrontend() {
  console.log('🚀 Starting frontend...');
  
  const vite = spawn('npx', ['vite', '--host', FRONTEND_HOST, '--port', FRONTEND_PORT], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
  });
  
  vite.on('error', (err) => {
    console.error('❌ Frontend failed to start:', err.message);
    process.exit(1);
  });
  
  return vite;
}

// Main
async function main() {
  console.log('🎬 Starting Hermes-Web development server...');
  
  // Check for API key before starting
  if (!checkApiKey()) {
    process.exit(1);
  }
  
  // Clean up stale bridge processes
  cleanupPort(BRIDGE_PORT);
  cleanupPort(FRONTEND_PORT);
  
  const bridge = await startBridge();
  
  // Wait a bit for bridge to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const frontend = await startFrontend();
  
  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    bridge.kill();
    frontend.kill();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
