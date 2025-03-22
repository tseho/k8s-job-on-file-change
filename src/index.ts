import chokidar from "chokidar";
import fetch from "node-fetch";
import debounce from "lodash.debounce";

const env = (key: string): string => {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Environment variable ${key} is missing`);
  }
  return val;
};

const WATCH_DIR = env("WATCH_DIR");
const WATCH_REGEX = env("WATCH_REGEX");
const K8S_API_SERVER = env("K8S_API_SERVER");
const K8S_TOKEN = env("K8S_TOKEN");
const K8S_NAMESPACE = env("K8S_NAMESPACE");
const K8S_CRONJOB = env("K8S_CRONJOB");
const DEBOUNCE_TIME = 5000; // ms

const createJob = async () => {
  try {
    const responseGetCronjob = await fetch(
      `${K8S_API_SERVER}/apis/batch/v1/namespaces/${K8S_NAMESPACE}/cronjobs/${K8S_CRONJOB}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${K8S_TOKEN}`,
          Accept: "application/json",
        },
      }
    );

    if (!responseGetCronjob.ok) {
      const errText = await responseGetCronjob.text();
      throw new Error(`Failed to fetch CronJob: ${responseGetCronjob.status} ${errText}`);
    }

    const cronjob = (await responseGetCronjob.json()) as any;

    const jobSpec = {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        generateName: `${K8S_CRONJOB}-manual-`,
        namespace: K8S_NAMESPACE,
      },
      spec: cronjob.spec.jobTemplate.spec,
    };

    const responseCreateJob = await fetch(
      `${K8S_API_SERVER}/apis/batch/v1/namespaces/${K8S_NAMESPACE}/jobs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${K8S_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(jobSpec),
      }
    );

    if (!responseCreateJob.ok) {
      const errText = await responseCreateJob.text();
      throw new Error(`Failed to create Job: ${responseCreateJob.status} ${errText}`);
    }

    const job = await responseCreateJob.json() as any;
    console.log("Job created from CronJob:", job.metadata.name);
  } catch (err) {
    console.error("Error creating Job from CronJob:", err);
  }
};

const debounced = debounce(() => {
  console.log("File change detected. Creating Job...");
  createJob();
}, DEBOUNCE_TIME);

const watcher = chokidar.watch(WATCH_DIR, {
  ignored: /(^|[\/\\])\../, // ignore dotfiles
  persistent: true,
});

watcher
  .on("change", (path) => {
    if (path.match(WATCH_REGEX)) {
      console.log(`Change detected in: ${path}`);
      debounced();
    }
  })
  .on("error", (error) => console.error(`Watcher error: ${error}`));

console.log(`Watching directory: ${WATCH_DIR}`);
