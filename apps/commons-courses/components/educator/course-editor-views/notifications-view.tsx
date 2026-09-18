"use client";

import { useState } from "react";
import { Field, FieldGrid, Input, SwitchRow, Textarea } from "@/components/ui/field";
import { Badge, Card, SectionTitle } from "@/components/ui/surface";
import { Segmented } from "@/components/ui/tabs";
import { MediaField } from "./media-field";
import type { CourseForm, CourseViewProps } from "./types";

type EmailSettings = CourseForm["emailSettings"];

export function NotificationsView({
  course,
  setCourse,
  uploadingMedia,
  uploadMedia,
  customEmailBranding,
}: CourseViewProps & { customEmailBranding: boolean }) {
  const [view, setView] = useState<"emails" | "branding">("emails");
  const settings = course.emailSettings;
  const patch = (value: Partial<EmailSettings>) =>
    setCourse((current) => ({ ...current, emailSettings: { ...current.emailSettings, ...value } }));
  const patchBranding = (value: Partial<EmailSettings["branding"]>) =>
    setCourse((current) => ({
      ...current,
      emailSettings: {
        ...current.emailSettings,
        branding: { ...current.emailSettings.branding, ...value },
      },
    }));

  return (
    <div className="space-y-5">
      <Segmented
        items={[
          { value: "emails", label: "Emails" },
          { value: "branding", label: "Branding" },
        ]}
        value={view}
        onChange={setView}
      />

      {view === "emails" ? (
        <>
          <Card className="divide-y divide-border py-2">
            <SwitchRow
              label="Enrollment confirmations"
              checked={settings.enrollmentEnabled}
              onChange={(enrollmentEnabled) => patch({ enrollmentEnabled })}
            />
            <SwitchRow
              label="New assignment emails"
              checked={settings.assignmentCreatedEnabled}
              onChange={(assignmentCreatedEnabled) => patch({ assignmentCreatedEnabled })}
            />
            <SwitchRow
              label="Assignment update emails"
              checked={settings.assignmentUpdatedEnabled}
              onChange={(assignmentUpdatedEnabled) => patch({ assignmentUpdatedEnabled })}
            />
            <SwitchRow
              label="Course update emails"
              checked={settings.courseUpdateEnabled}
              onChange={(courseUpdateEnabled) => patch({ courseUpdateEnabled })}
            />
            <SwitchRow
              label="Let course agents send emails"
              info="Course agents can draft and send course emails on your behalf."
              checked={settings.agentManaged}
              onChange={(agentManaged) => patch({ agentManaged })}
            />
          </Card>
          <Card className="space-y-4">
            <Field label="Reply-to address" optional>
              <Input
                type="email"
                value={settings.replyTo || ""}
                onChange={(event) => patch({ replyTo: event.target.value })}
              />
            </Field>
            <Field label="Enrollment email intro" optional info="A short personal note added to the enrollment email.">
              <Textarea
                rows={3}
                value={settings.customIntro || ""}
                onChange={(event) => patch({ customIntro: event.target.value })}
              />
            </Field>
          </Card>
        </>
      ) : (
        <Card className="space-y-4">
          <SectionTitle
            title="Custom email branding"
            info="Use your logo, accent color, sender name and footer on learner emails."
            action={customEmailBranding ? null : <Badge tone="warning">Paid plans</Badge>}
          />
          {!customEmailBranding ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-stone-600">
              Available on Starter, Growth and Institution plans.
            </p>
          ) : null}
          <SwitchRow
            label="Use custom branding"
            checked={settings.branding.enabled}
            disabled={!customEmailBranding}
            onChange={(enabled) => patchBranding({ enabled })}
          />
          <fieldset
            disabled={!customEmailBranding || !settings.branding.enabled}
            className="space-y-4 disabled:opacity-50"
          >
            <FieldGrid>
              <Field label="Sender name">
                <Input
                  maxLength={80}
                  placeholder="Your organization"
                  value={settings.branding.senderName}
                  onChange={(event) => patchBranding({ senderName: event.target.value })}
                />
              </Field>
              <Field label="Accent color">
                <div className="ui-control flex items-center gap-3 py-1.5">
                  <input
                    type="color"
                    value={settings.branding.accentColor}
                    onChange={(event) => patchBranding({ accentColor: event.target.value })}
                    className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                    aria-label="Accent color"
                  />
                  <span className="text-xs text-muted-foreground">{settings.branding.accentColor}</span>
                </div>
              </Field>
            </FieldGrid>
            <div className="max-w-60">
              <MediaField
                label="Logo"
                info="PNG, JPEG or WebP."
                aspect="square"
                value={settings.branding.logoUrl}
                onChange={(logoUrl) => patchBranding({ logoUrl })}
                onUpload={(file) => uploadMedia("emailSettings.logoUrl", file)}
                uploading={uploadingMedia === "emailSettings.logoUrl"}
              />
            </div>
            <Field label="Footer message" optional>
              <Textarea
                rows={2}
                maxLength={240}
                placeholder="A short organization or support message"
                value={settings.branding.footerText}
                onChange={(event) => patchBranding({ footerText: event.target.value })}
              />
            </Field>
          </fieldset>
        </Card>
      )}
    </div>
  );
}
