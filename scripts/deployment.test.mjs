import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicSettings} from './validate-public-env.mjs';
const settings={NEXT_PUBLIC_APP_URL:'https://example.github.io/operis/',NEXT_PUBLIC_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_example'};
test('Pages paths are derived for project, root and custom domains',()=>{
 assert.equal(publicSettings(settings).NEXT_PUBLIC_BASE_PATH,'/operis');
 assert.equal(publicSettings({...settings,NEXT_PUBLIC_APP_URL:'https://example.github.io/'}).NEXT_PUBLIC_BASE_PATH,'');
 assert.equal(publicSettings({...settings,NEXT_PUBLIC_APP_URL:'https://app.example.com/'}).NEXT_PUBLIC_BASE_PATH,'');
});
test('deployment rejects secrets in public key fields and malformed URLs',()=>{
 for(const key of ['sb_secret_forbidden','header.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature','sb_publishable_x\nEVIL=1'])assert.throws(()=>publicSettings({...settings,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key}));
 for(const url of ['http://example.com','https://user:pass@example.com','https://example.com/#/login','https://example.com/?x=1'])assert.throws(()=>publicSettings({...settings,NEXT_PUBLIC_APP_URL:url}));
});
