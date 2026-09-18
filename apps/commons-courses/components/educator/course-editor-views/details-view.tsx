"use client";

import type { CSSProperties } from "react";
import { RotateCcw } from "lucide-react";
import { ColorPicker } from "@/components/color-picker";
import { RichTextEditor } from "@/components/educator/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Field, FieldGrid, Input, Select, SwitchRow, Textarea } from "@/components/ui/field";
import { Card, SectionTitle } from "@/components/ui/surface";
import { useQueryTab } from "@/components/ui/tabs";
import { defaultCourseTheme, getCourseThemeStyle, type CourseTheme } from "@/lib/course-theme";
import type { LiveSchedule } from "@/lib/course-schedule";
import { MediaField } from "./media-field";
import type { CourseForm, CourseViewProps } from "./types";

const TABS = ["general", "description", "media", "brand", "schedule", "publishing"] as const;

const themeLabels: Record<keyof CourseTheme, string> = {
  primary: "Primary actions",
  accent: "Accent",
  highlight: "Highlight",
  background: "Page background",
  surface: "Cards and content",
  text: "Main text",
};

export function DetailsView({ course, setCourse, uploadingMedia, uploadMedia }: CourseViewProps) {
  const [tab] = useQueryTab(TABS, "general");
  const patch = (value: Partial<CourseForm>) => setCourse((current) => ({ ...current, ...value }));
  const patchSchedule = (value: Partial<LiveSchedule>) =>
    setCourse((current) => ({
      ...current,
      liveSchedule: { ...current.liveSchedule, ...value },
    }));

  if (tab === "description") {
    return (
      <Card className="space-y-5">
        <Field
          label="Short description"
          info="Shown on course cards and search results. One or two sentences."
        >
          <Textarea
            rows={3}
            value={course.description}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </Field>
        <RichTextEditor
          label="Full description"
          value={course.longDescription}
          onChange={(longDescription) => patch({ longDescription })}
        />
      </Card>
    );
  }

  if (tab === "media") {
    return (
      <Card>
        <div className="grid gap-6 md:grid-cols-3">
          <MediaField
            label="Card image"
            info="Used on catalog cards."
            value={course.imageUrl || ""}
            onChange={(imageUrl) => patch({ imageUrl })}
            onUpload={(file) => uploadMedia("imageUrl", file)}
            uploading={uploadingMedia === "imageUrl"}
          />
          <MediaField
            label="Banner"
            info="Shown at the top of the course page."
            value={course.bannerImageUrl || ""}
            onChange={(bannerImageUrl) => patch({ bannerImageUrl })}
            onUpload={(file) => uploadMedia("bannerImageUrl", file)}
            uploading={uploadingMedia === "bannerImageUrl"}
          />
          <MediaField
            label="Link preview"
            info="Shown when the course link is shared. Use a public 1200 × 630 image."
            value={course.previewImageUrl || ""}
            onChange={(previewImageUrl) => patch({ previewImageUrl })}
            onUpload={(file) => uploadMedia("previewImageUrl", file)}
            uploading={uploadingMedia === "previewImageUrl"}
          />
        </div>
      </Card>
    );
  }

  if (tab === "brand") {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <SectionTitle
            title="Colors"
            info="Pick any colors. CommonLab keeps text readable on primary and accent colors automatically."
            action={
              <Button
                size="sm"
                variant="ghost"
                icon={RotateCcw}
                onClick={() => patch({ theme: defaultCourseTheme })}
              >
                Reset
              </Button>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(course.theme) as Array<keyof CourseTheme>).map((key) => (
              <ColorPicker
                key={key}
                label={themeLabels[key]}
                value={course.theme[key]}
                onChange={(value) =>
                  setCourse((current) => ({
                    ...current,
                    theme: { ...current.theme, [key]: value },
                  }))
                }
              />
            ))}
          </div>
        </Card>
        <div
          style={getCourseThemeStyle(course.theme) as CSSProperties}
          className="h-fit overflow-hidden rounded-xl border border-border bg-[var(--course-background)] p-5 text-[var(--course-text)] shadow-card"
        >
          <p className="mb-3 text-xs opacity-60">Preview</p>
          <div className="rounded-lg bg-[var(--course-surface)] p-5 shadow-sm">
            <span className="rounded-full bg-[var(--course-accent)] px-2.5 py-1 text-xs font-medium text-[var(--course-on-accent)]">
              {course.courseType === "live" ? "Live" : "Self-paced"}
            </span>
            <p className="mt-4 text-lg font-medium">{course.title || "Your course title"}</p>
            <p className="mt-1 text-sm opacity-65">{course.tagline || "A short tagline"}</p>
            <div className="mt-5 flex gap-2">
              <span className="rounded-lg bg-[var(--course-primary)] px-3 py-2 text-xs font-medium text-[var(--course-on-primary)]">
                Primary action
              </span>
              <span className="rounded-lg bg-[var(--course-highlight)] px-3 py-2 text-xs font-medium text-[var(--course-on-highlight)]">
                Highlight
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (tab === "schedule") {
    const live = course.courseType === "live";
    return (
      <div className="space-y-5">
        <Card>
          <SectionTitle
            title="Dates"
            info="Learners can enroll before the start date, but lessons stay locked until that day."
          />
          <FieldGrid>
            <Field label="Start date">
              <Input
                type="date"
                value={course.startDate || ""}
                onChange={(event) => patch({ startDate: event.target.value })}
              />
            </Field>
            <Field label="Next live session" optional>
              <Input
                type="datetime-local"
                value={course.nextSessionDate || ""}
                onChange={(event) => patch({ nextSessionDate: event.target.value })}
              />
            </Field>
          </FieldGrid>
        </Card>
        {live ? (
          <>
            <Card>
              <SectionTitle
                title="Live schedule"
                info="Explains how live meetings relate to the course lessons."
              />
              <FieldGrid columns={3}>
                <Field label="Cadence">
                  <Select
                    value={course.liveSchedule.cadence || "weekly"}
                    onChange={(event) =>
                      patchSchedule({ cadence: event.target.value as LiveSchedule["cadence"] })
                    }
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Every other week</option>
                    <option value="monthly">Monthly</option>
                    <option value="custom">Custom</option>
                  </Select>
                </Field>
                <Field label="Day">
                  <Select
                    value={course.liveSchedule.dayOfWeek || ""}
                    onChange={(event) => patchSchedule({ dayOfWeek: event.target.value })}
                  >
                    <option value="">Choose day</option>
                    {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
                      (day) => (
                        <option key={day} value={day}>
                          {day[0].toUpperCase() + day.slice(1)}
                        </option>
                      ),
                    )}
                  </Select>
                </Field>
                <Field label="Time">
                  <Input
                    type="time"
                    value={course.liveSchedule.time || ""}
                    onChange={(event) => patchSchedule({ time: event.target.value })}
                  />
                </Field>
                <Field label="Timezone">
                  <Input
                    value={course.liveSchedule.timezone || ""}
                    placeholder="Africa/Nairobi"
                    onChange={(event) => patchSchedule({ timezone: event.target.value })}
                  />
                </Field>
                <Field label="Number of classes">
                  <Input
                    type="number"
                    min={0}
                    value={String(course.liveSchedule.sessionsCount || "")}
                    onChange={(event) =>
                      patchSchedule({ sessionsCount: Number(event.target.value) || undefined })
                    }
                  />
                </Field>
                <Field label="Max enrollments" optional>
                  <Input
                    type="number"
                    min={0}
                    value={String(course.maxEnrollments || "")}
                    onChange={(event) =>
                      patch({ maxEnrollments: Number(event.target.value) || undefined })
                    }
                  />
                </Field>
              </FieldGrid>
              <Field label="Note for learners" optional className="mt-4">
                <Textarea
                  rows={2}
                  value={course.liveSchedule.description || ""}
                  onChange={(event) => patchSchedule({ description: event.target.value })}
                />
              </Field>
            </Card>
            <Card>
              <SectionTitle title="Meeting details" />
              <div className="space-y-4">
                <Field label="Meeting link" optional>
                  <Input
                    type="url"
                    placeholder="https://"
                    value={course.liveSessionUrl || ""}
                    onChange={(event) => patch({ liveSessionUrl: event.target.value })}
                  />
                </Field>
                <Field label="Session dates" optional info="One date per line.">
                  <Textarea
                    rows={3}
                    value={course.sessionDatesText}
                    onChange={(event) => patch({ sessionDatesText: event.target.value })}
                  />
                </Field>
              </div>
            </Card>
          </>
        ) : null}
      </div>
    );
  }

  if (tab === "publishing") {
    return (
      <Card className="divide-y divide-border py-2">
        <SwitchRow
          label="Published"
          info="Published courses can be opened and purchased. Drafts are only visible to you and collaborators."
          checked={course.published}
          onChange={(published) => patch({ published })}
        />
        <div className="flex flex-wrap items-center justify-between gap-4 py-3">
          <div>
            <span className="text-sm text-foreground">Catalog visibility</span>
          </div>
          <Select
            value={course.catalogVisibility}
            className="w-auto min-w-56"
            onChange={(event) =>
              patch({ catalogVisibility: event.target.value as CourseForm["catalogVisibility"] })
            }
          >
            <option value="public">Public, listed in the catalog</option>
            <option value="private">Private, invited learners only</option>
          </Select>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <FieldGrid>
        <Field label="Title">
          <Input required value={course.title} onChange={(event) => patch({ title: event.target.value })} />
        </Field>
        <Field label="URL slug" info="Changing the slug changes the course link.">
          <Input value={course.slug || ""} onChange={(event) => patch({ slug: event.target.value })} />
        </Field>
        <Field label="Tagline" className="sm:col-span-2">
          <Input required value={course.tagline} onChange={(event) => patch({ tagline: event.target.value })} />
        </Field>
        <Field label="Instructor">
          <Input value={course.instructor} onChange={(event) => patch({ instructor: event.target.value })} />
        </Field>
        <Field label="Duration">
          <Input value={course.duration} onChange={(event) => patch({ duration: event.target.value })} />
        </Field>
        <Field label="Level">
          <Select
            value={course.level}
            onChange={(event) => patch({ level: event.target.value as CourseForm["level"] })}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </Select>
        </Field>
        <Field label="Format">
          <Select
            value={course.courseType}
            onChange={(event) => patch({ courseType: event.target.value as CourseForm["courseType"] })}
          >
            <option value="self-paced">Self-paced</option>
            <option value="live">Live</option>
          </Select>
        </Field>
        <Field label="Tags" info="Separate tags with commas." className="sm:col-span-2">
          <Input value={course.tagsText} onChange={(event) => patch({ tagsText: event.target.value })} />
        </Field>
      </FieldGrid>
    </Card>
  );
}
