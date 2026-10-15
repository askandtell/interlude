import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
mkdirSync('deploy', { recursive: true });
if (existsSync('.env') || existsSync('deploy/livekit.local.yaml')) {
  console.log('Existing configuration preserved. See .env.example to configure manually.');
  process.exit(0);
}
const secret = () => randomBytes(32).toString('base64url');
const key = 'interlude-local', mediaSecret = secret();
writeFileSync('.env', `HOST=127.0.0.1\nPORT=18080\nAPP_ORIGIN=http://127.0.0.1:15173\nSESSION_SECRET=${secret()}\nLIVEKIT_URL=ws://127.0.0.1:7880\nLIVEKIT_INTERNAL_URL=http://127.0.0.1:7880\nLIVEKIT_API_KEY=${key}\nLIVEKIT_API_SECRET=${mediaSecret}\n# Set REDIS_URL=redis://127.0.0.1:6379 when Redis is available.\n`);
const config = {port:7880,rtc:{tcp_port:7881,udp_port:7882,use_external_ip:false,node_ip:"127.0.0.1"},keys:{[key]:mediaSecret},limit:{num_tracks:64,bytes_per_sec:40000000,subscription_limit_video:2,subscription_limit_audio:10,signal_message_size_limit:65536,max_api_request_body_size:1048576,max_metadata_size:1024},webhook:{api_key:key,urls:["http://127.0.0.1:18080/api/livekit/webhook"]},logging:{level:"warn"}};
writeFileSync("deploy/livekit.local.yaml",JSON.stringify(config,null,2));
config.webhook.urls=["http://app:18080/api/livekit/webhook"];
writeFileSync("deploy/livekit.docker.local.yaml",JSON.stringify(config,null,2));
console.log('Created ignored local configuration with random secrets. This configuration is for localhost only.');
