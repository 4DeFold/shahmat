// Regenerate bundled board art after updating licensed SVGs in public/pieces.
import {readFile,writeFile,mkdir,readdir,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sets=['cburnett','celtic','chessnut','fantasy','firi','kiwen-suwi','merida','mono','rhosgfx','spatial'],manifest={};
await mkdir('public/piece-packs',{recursive:true});await mkdir('pages/piece-bundles',{recursive:true});
for(const file of await readdir('public/piece-packs'))if(file.endsWith('.json'))await unlink(`public/piece-packs/${file}`);
for(const set of sets){const items={};for(const c of 'wb')for(const t of 'KQRBNP')items[c+t]=await readFile(`public/pieces/${set}/${c}${t}.svg`,'utf8');
 const text=JSON.stringify(items);
 if(set==='cburnett')await writeFile('pages/piece-bundles/cburnett.js',`// Generated from public/pieces/cburnett; see that directory for license.\nexport default ${text};\n`);
 else{const hash=createHash('sha256').update(text).digest('hex').slice(0,12),path=`/piece-packs/${set}-${hash}.json`;manifest[set]=path;await writeFile('public'+path,text)}
}
await writeFile('pages/piece-packs-manifest.js',`// Generated from public/pieces; packs retain their original SVG artwork and licenses.\nexport default ${JSON.stringify(manifest)};\n`);
