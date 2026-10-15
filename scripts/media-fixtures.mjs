import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
mkdirSync('.cache/fixtures', { recursive: true });
const cases = [
  ['sample.mp4', ['-f','lavfi','-i','testsrc2=size=640x360:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','20','-c:v','libx264','-pix_fmt','yuv420p','-preset','ultrafast','-c:a','aac','-movflags','+faststart']],
  ['silent.mp4', ['-f','lavfi','-i','testsrc2=size=640x360:rate=30','-t','4','-c:v','libx264','-pix_fmt','yuv420p','-an']],
  ['sample.webm', ['-f','lavfi','-i','testsrc2=size=640x360:rate=15','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','5','-c:v','libvpx','-deadline','realtime','-c:a','libopus']],
  ['sample.mkv', ['-i','.cache/fixtures/sample.mp4','-c','copy']],
];
for (const [name,args] of cases) { const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args,`.cache/fixtures/${name}`],{stdio:'inherit'}); if(result.status!==0)process.exit(result.status || 1); console.log(`Generated ${name}`); }
// A decoded-picture clock, independent of application/control timestamps.
// Twelve black/white cells encode the frame number; useful for measured render skew.
const width=320,height=180,frames=900,raw=Buffer.alloc(width*height*3*frames);
for(let n=0;n<frames;n++)for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const offset=((n*height+y)*width+x)*3;
  if(y>=45&&y<78&&x<240){const v=((n>>Math.floor(x/20))&1)?240:16;raw[offset]=raw[offset+1]=raw[offset+2]=v;}
  else{raw[offset]=35+x/3;raw[offset+1]=60+y/2;raw[offset+2]=110;}
}
const encoded=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',`${width}x${height}`,'-r','30','-i','pipe:0','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','30','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','.cache/fixtures/barcode.mp4'],{input:raw,stdio:['pipe','inherit','inherit']});
if(encoded.status!==0)process.exit(encoded.status||1);
console.log('Generated barcode.mp4 (12-bit rendered frame clock, 30fps)');
