import type { ResetClassroomCommand } from "@/core/lesson/bootstrap";

type ResetClassroom = { execute(command: ResetClassroomCommand): Promise<unknown> };
type DataStorage = Pick<Storage, "removeItem">;

export class ClassroomStorageClearError extends Error {
  constructor() {
    super("The active classroom was reset, but browser storage could not be fully cleared. Remove this site's data in your browser settings to clear any remaining saved data.");
  }
}

export async function clearClassroomData(reset: ResetClassroom, local: () => DataStorage, session: () => DataStorage): Promise<void> {
  await reset.execute({ scope: "all" });
  let failed = false;
  try { local().removeItem("lessonique.workspace.v1"); } catch { failed = true; }
  try { session().removeItem("lessonique.lesson.v1"); } catch { failed = true; }
  if (failed) throw new ClassroomStorageClearError();
}
