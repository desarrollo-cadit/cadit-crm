CREATE TABLE "teacher_course" (
	"teacher_id" text NOT NULL,
	"course_id" text NOT NULL,
	CONSTRAINT "teacher_course_teacher_id_course_id_pk" PRIMARY KEY("teacher_id","course_id")
);
--> statement-breakpoint
ALTER TABLE "cohort" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "cohort" ADD COLUMN "start_time" text;--> statement-breakpoint
ALTER TABLE "cohort" ADD COLUMN "end_time" text;--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "hourly_rate" integer;--> statement-breakpoint
ALTER TABLE "teacher_course" ADD CONSTRAINT "teacher_course_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_course" ADD CONSTRAINT "teacher_course_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "teacher_course_course_idx" ON "teacher_course" USING btree ("course_id");