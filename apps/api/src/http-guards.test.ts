import {test} from 'node:test';
import assert from 'node:assert/strict';
import {protectedApiResponse,unsafeBrowserRequest} from './http-guards.js';

const site='https://cabo-human-capital.onrender.com';
const request={method:'POST',host:'cabo-human-capital.onrender.com',protocol:'https'};
test('browser API writes require the exact trusted CABO origin',()=>{
 assert.equal(unsafeBrowserRequest({...request,origin:site,fetchSite:'same-origin'},site),null);
 assert.match(unsafeBrowserRequest({...request,origin:'https://evil.example'},site)??'',/Origin/);
 assert.match(unsafeBrowserRequest({...request,referer:'https://malicious.example/form'},site)??'',/Referrer/);
 assert.match(unsafeBrowserRequest({...request,origin:'null'},site)??'',/Opaque/);
 assert.match(unsafeBrowserRequest({...request,origin:'ht@tp'},site)??'',/Malformed/);
 assert.match(unsafeBrowserRequest({...request,origin:site+'.evil.example'},site)??'',/Origin/);
});
test('Fetch Metadata blocks cross-site and same-site form posts',()=>{
 assert.match(unsafeBrowserRequest({...request,fetchSite:'cross-site'},site)??'',/Cross-site/);
 assert.match(unsafeBrowserRequest({...request,fetchSite:'same-site',origin:site},site)??'',/Cross-site/);
 assert.equal(unsafeBrowserRequest({...request,fetchSite:'same-origin'},site),null);
});
test('native API clients without browser request metadata can send authenticated writes',()=>{
 assert.equal(unsafeBrowserRequest({...request},site),null);
});
test('safe read methods are not rejected',()=>{
 assert.equal(unsafeBrowserRequest({...request,method:'GET',origin:'https://attacker.test'},site),null);
 assert.equal(unsafeBrowserRequest({...request,method:'HEAD',origin:'https://attacker.test'},site),null);
});
test('private API response headers only apply to API routes',()=>{
 assert.equal(protectedApiResponse('/api/v1/auth/me'),true);
 assert.equal(protectedApiResponse('/api/v1/public/careers'),true);
 assert.equal(protectedApiResponse('/'),false);
 assert.equal(protectedApiResponse('/assets/main.js'),false);
});
