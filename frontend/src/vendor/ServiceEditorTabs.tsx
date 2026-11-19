import { useState, type ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';

/** Tab state is isolated here so the parent editor retains its existing draft hooks. */
export function ServiceEditorTabs({general,booking,locations,advanced,busy,bookingEnabled=true}:{general:ReactNode;booking:ReactNode;locations:ReactNode;advanced?:ReactNode;busy:boolean;bookingEnabled?:boolean}) {
  const [tab,setTab]=useState('general');
  return <Tabs value={!bookingEnabled&&tab==='booking'?'general':tab} onValueChange={value=>setTab(String(value))}>
    <TabsList aria-label="Service details" className="config-tabs-list">
      <TabsTrigger value="general" data-service-tab-trigger="general" disabled={busy}>General</TabsTrigger>
      {bookingEnabled?<TabsTrigger value="booking" data-service-tab-trigger="booking" disabled={busy}>Ordinary bookings</TabsTrigger>:null}
      <TabsTrigger value="locations" data-service-tab-trigger="locations" disabled={busy}>Locations</TabsTrigger>
      {advanced?<TabsTrigger value="advanced" data-service-tab-trigger="advanced" disabled={busy}>Advanced</TabsTrigger>:null}
    </TabsList>
    <TabsContent value="general" keepMounted data-service-tab="general">{general}</TabsContent>
    {bookingEnabled?<TabsContent value="booking" keepMounted data-service-tab="booking">{booking}</TabsContent>:null}
    <TabsContent value="locations" keepMounted data-service-tab="locations">{locations}</TabsContent>
    {advanced?<TabsContent value="advanced" keepMounted data-service-tab="advanced">{advanced}</TabsContent>:null}
  </Tabs>;
}
