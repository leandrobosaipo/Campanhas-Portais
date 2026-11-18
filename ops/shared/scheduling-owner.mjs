import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export function schedulingOwnedByN8n(resource) {
  const file=process.env.ADOPS_SCHEDULING_OWNER_FILE || join(process.env.ADOPS_PROJECT_ROOT || process.cwd(),'config/adops-scheduling-owner.json');
  let config;
  try { config=JSON.parse(readFileSync(file,'utf8')); }
  catch(error) { if(error.code==='ENOENT')return false; throw new Error('invalid_scheduling_ownership_config'); }
  if(!['legacy','n8n'].includes(config[resource]))throw new Error('missing_scheduling_ownership_resource');
  return config[resource]==='n8n';
}
