import React from 'react';
import {createRoot} from 'react-dom/client';
const surface=new URLSearchParams(location.search).get('surface') || 'vendor';
const dark=new URLSearchParams(location.search).get('theme')==='dark';
async function mount(){
 if(surface==='platform'){
  await import('../../platform-dashboard-shadcn/src/index.css');
  const {Button}=await import('../../platform-dashboard-shadcn/src/components/ui/button');
  const {Input}=await import('../../platform-dashboard-shadcn/src/components/ui/input');
  const {Badge}=await import('../../platform-dashboard-shadcn/src/components/ui/badge');
  document.documentElement.classList.toggle('dark',dark);
  createRoot(document.getElementById('root')!).render(<main style={{padding:24,background:'var(--card)',color:'var(--foreground)'}}><h1>Platform controls</h1><p className="text-muted-foreground">Updated service overview</p><Button>Save changes</Button><Button variant="outline">Review details</Button><Button variant="destructive">Delete item</Button><Input aria-label="Platform name" defaultValue="Review workspace"/><Badge variant="success">Active</Badge><Badge variant="warning">Needs review</Badge><Badge variant="destructive">Failed</Badge><p className="text-foreground">Latest reviewer feedback</p><div className="bg-muted text-foreground">Support and review note</div></main>);
 } else if(surface==='developer'){
  await import('@mantine/core/styles.css');
  await import('../../developer-portal/src/DeveloperPortalPage.css');
  await import('../../developer-portal/src/DeveloperWorkspace.css');
  await import('../../developer-portal/src/DeveloperShell.css');
  const {MantineProvider,Button,TextInput}=await import('@mantine/core');
  createRoot(document.getElementById('root')!).render(<MantineProvider><main className={'developer-portal '+(!dark?'developer-portal-light':'')} style={{padding:24}}><section className="developer-workspace dpp" data-api-theme={dark?'dark':'light'}><h1>Developer workspace</h1><p>Manage your API projects</p><Button>Save project</Button><Button variant="light">Review project</Button><Button variant="default">Project settings</Button><Button variant="subtle">View reference</Button><button>Native project action</button><TextInput label="Project name" defaultValue="Local project"/><a href="#reference">API reference</a><span className="developer-workspace-status active">Active</span><span className="developer-workspace-status failed">Failed</span><span className="developer-workspace-next-badge">Next step</span></section></main></MantineProvider>);
 } else {
  await import('../../frontend/src/styles.css');
  if(surface==='vendor'){
   await import('../../frontend/src/vendor/styles.css');
   const {Button}=await import('../../frontend/src/vendor/components/ui/button');
   const {Input}=await import('../../frontend/src/vendor/components/ui/input');
   const {Alert,AlertDescription}=await import('../../frontend/src/vendor/components/ui/alert');
   createRoot(document.getElementById('root')!).render(<main className="vendor-workspace" data-vendor-theme={dark?'dark':'light'} style={{display:'block',padding:24}}><h1>Vendor workspace</h1><p className="queue-muted">Select a service request</p><Button>New request</Button><Button variant="outline">Refresh requests</Button><Button variant="destructive">Delete request</Button><Input aria-label="Customer name" defaultValue="Local customer"/><a href="#queue">Open queue</a><p style={{color:'var(--info)'}}>Store hours updated</p><p style={{color:'var(--success)'}}>Ready to call</p><p style={{color:'var(--warning)'}}>Needs review</p>{(["info","success","warning","error"] as const).map(tone=><Alert key={tone} variant={tone}><AlertDescription>{tone} alert message</AlertDescription></Alert>)}</main>);
  } else createRoot(document.getElementById('root')!).render(<main className="auth-page"><h1>Public surface</h1><p>Find a local service</p><button>Continue</button><input aria-label="Search" defaultValue="Courts"/><a href="#login">Login</a></main>);
 }
 document.documentElement.dataset.ready='true';
}
void mount();
