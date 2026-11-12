import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isProgrammePage,
  programmeMetadata,
  programmeShare,
  registrationSlugForPage,
} from "./programme-metadata.ts";

const event = {
  slug: "future-camp",
  title: "Future camp",
  summary: "Make games and stories.",
  theme: { imageUrl: "https://images.example/camp.png" },
};
const page = {
  slug: "makers",
  title: "Make something",
  description: "Three mornings of making.",
  imageUrl: "https://images.example/share.png",
  registrationUrl: "/register/future-camp",
};
const options = {
  baseUrl: "https://commonlab.example",
  path: "/register/future-camp?reference=private-reference#receipt",
};

test("a programme page and registration share the same branded social card", () => {
  const share = programmeShare(page, event);
  const landing = programmeMetadata(share, { ...options, path: "/p/makers" });
  const registration = programmeMetadata(share, {
    ...options,
    browserTitle: "Register | Future camp",
  });
  for (const key of ["title", "description", "images", "siteName"])
    assert.deepEqual(
      (registration.openGraph as any)[key],
      (landing.openGraph as any)[key],
    );
  assert.deepEqual(registration.twitter, landing.twitter);
  assert.deepEqual(registration.title, { absolute: "Register | Future camp" });
  assert.equal(
    (registration.openGraph as any).url,
    "https://commonlab.example/register/future-camp",
  );
  assert(!JSON.stringify(registration).includes("private-reference"));
});

test("future registrations without a landing page use their own programme details", () => {
  const metadata = programmeMetadata(programmeShare(null, event), options);
  assert.equal((metadata.openGraph as any).title, event.title);
  assert.equal((metadata.twitter as any).description, event.summary);
  assert.equal((metadata.openGraph as any).images[0].url, event.theme.imageUrl);
});

test("blank page fields use the same course fallback on both routes", () => {
  const share = programmeShare(
    { ...page, description: " ", imageUrl: "" },
    event,
  );
  assert.equal(share.description, event.summary);
  assert.equal(share.imageUrl, event.theme.imageUrl);
  assert.equal(
    programmeMetadata(
      programmeShare({ ...page, description: "", imageUrl: "" }),
      options,
    ).description,
    page.title,
  );
});

test("automatic same-slug matching cannot adopt another programme's page", () => {
  assert(isProgrammePage(page, event));
  assert(
    !isProgrammePage(
      { ...page, registrationUrl: "/register/other-camp" },
      event,
    ),
  );
  assert(!isProgrammePage({ ...page, registrationUrl: undefined }, event));
  assert(
    isProgrammePage(
      { ...page, registrationUrl: undefined },
      { ...event, pageSlug: page.slug },
    ),
  );
  assert.equal(
    registrationSlugForPage({
      ...page,
      registrationUrl: "https://elsewhere.example/register/future-camp",
    }),
    undefined,
  );
});
