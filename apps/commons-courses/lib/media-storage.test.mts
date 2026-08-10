import assert from "node:assert/strict";
import test from "node:test";

import { resolveCourseMediaAwsRoleArn } from "./media-storage.ts";

const courseMediaRole = "arn:aws:iam::123456789012:role/commonlab-course-media";
const genericRole = "arn:aws:iam::123456789012:role/generic-runtime";

test("trims the dedicated course-media role ARN", () => {
  assert.equal(
    resolveCourseMediaAwsRoleArn({
      COURSE_MEDIA_AWS_ROLE_ARN: ` ${courseMediaRole}\n`,
    }),
    courseMediaRole,
  );
});

test("prefers the dedicated course-media role over a generic AWS role", () => {
  assert.equal(
    resolveCourseMediaAwsRoleArn({
      COURSE_MEDIA_AWS_ROLE_ARN: courseMediaRole,
      AWS_ROLE_ARN: genericRole,
    }),
    courseMediaRole,
  );
});

test("falls back to a valid generic AWS role", () => {
  assert.equal(
    resolveCourseMediaAwsRoleArn({ AWS_ROLE_ARN: genericRole }),
    genericRole,
  );
});

test("rejects malformed role ARNs before calling AWS", () => {
  assert.throws(
    () =>
      resolveCourseMediaAwsRoleArn({
        COURSE_MEDIA_AWS_ROLE_ARN: "not-an-arn",
      }),
    /Course media AWS role ARN is invalid/,
  );
});
