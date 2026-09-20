import { useSearchParams } from "react-router-dom";

import { GoogleSection } from "@/components/settings/GoogleSection";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { SecuritySection } from "@/components/settings/SecuritySection";
import { TagsSection } from "@/components/settings/TagsSection";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "profile", label: "Profile" },
  { value: "google", label: "Google Calendar" },
  { value: "tags", label: "Tags" },
  { value: "security", label: "Security" },
];

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // The Google OAuth callback returns to /settings?google=..., so land on that tab.
  const requested = searchParams.get("tab");
  const tab = searchParams.get("google") ? "google" : (requested ?? "profile");

  function setTab(value: string) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Your account, integrations and security." />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile">
          <ProfileSection />
        </TabsContent>
        <TabsContent value="google">
          <GoogleSection />
        </TabsContent>
        <TabsContent value="tags">
          <TagsSection />
        </TabsContent>
        <TabsContent value="security">
          <SecuritySection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
