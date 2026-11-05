import { useState, type ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';

/** Tab state is isolated here so the parent editor retains its existing draft hooks. */
export function ServiceEditorTabs({general,booking,locations,busy}:{general:ReactNode;booking:ReactNode;locations:ReactNode;busy:boolean}) {
  const [tab,setTab]=useState('general');
  return <Tabs value={tab} onValueChange={value=>setTab(String(value))}>
    <TabsList aria-label="Service details" className="config-tabs-list">
      <TabsTrigger value="general" data-service-tab-trigger="general" disabled={busy}>General</TabsTrigger>
      <TabsTrigger value="booking" data-service-tab-trigger="booking" disabled={busy}>Booking</TabsTrigger>
      <TabsTrigger value="locations" data-service-tab-trigger="locations" disabled={busy}>Locations</TabsTrigger>
    </TabsList>
    <TabsContent value="general" keepMounted data-service-tab="general">{general}</TabsContent>
    <TabsContent value="booking" keepMounted data-service-tab="booking">{booking}</TabsContent>
    <TabsContent value="locations" keepMounted data-service-tab="locations">{locations}</TabsContent>
  </Tabs>;
}
