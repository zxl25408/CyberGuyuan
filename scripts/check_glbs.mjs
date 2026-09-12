import fs from 'node:fs';
const files = ['terrain.glb', 'buildings.glb', 'roads.glb', 'landmarks.glb',
  'coastal-bridges.glb', 'coastal-shoreline.glb', 'opposite-shore.glb'];
for (const f of files) {
  const b = fs.readFileSync('public/city/' + f);
  const magic = b.readUInt32LE(0) === 0x46546C67;
  const ver = b.readUInt32LE(4) === 2;
  const total = b.readUInt32LE(8) === b.length;
  const jlen = b.readUInt32LE(12);
  let meshes = -1, mats = '';
  try {
    const j = JSON.parse(b.slice(20, 20 + jlen).toString('utf8'));
    meshes = j.meshes.length;
    mats = j.materials.map(m => m.name).join(',');
  } catch (e) { mats = 'JSON PARSE FAIL: ' + e.message.slice(0, 60); }
  console.log(f.padEnd(24), 'magic:' + magic, 'version:' + ver, 'total:' + total,
    'meshes:' + meshes, '[' + mats.slice(0, 60) + ']');
}
