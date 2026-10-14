# Temporary staging compute

The owner configures CPU/RAM and GPU access separately in Computer → Performance. Both default to Ask first. Requests produce an owner approval card with an estimated cost and duration; an agent cannot approve its own proposal. Automatic access requires a saved owner setting. A task binds the lease to its chat and run, restores the previous profile on completion, and expires remaining leases. Persistent storage is retained. Compute price intervals settle before a profile change; partial minutes round up.

## Capacity

The existing `common-os-agents` node group stays unchanged. `staging-compute-capacity.yml` adds one CPU group (`m7i.2xlarge`, 8 CPU / 32 GiB) and one GPU group (`g5.4xlarge`, 16 CPU / 64 GiB / A10G), each with minimum and desired size zero and maximum size one. The GPU quota must allow 16 G-instance vCPUs. The standard EC2 quota must cover the existing nodes plus the CPU group.

Deploy the capacity stack with the existing cluster, node IAM role and subnet IDs. Apply `staging-compute-runtime-classes.yml` and `staging-compute-device-plugin.yml` to that cluster. The runtime classes select and tolerate only the matching staging node group. The GPU taint and selector prevent CPU-only tasks from starting GPU capacity. The NVIDIA device plugin runs only on staging GPU nodes.

Managed node group tags do not replace autoscaling-group discovery tags. On each node group's backing ASG, ensure `k8s.io/cluster-autoscaler/enabled=true` and `k8s.io/cluster-autoscaler/common-os-agents=owned`, with node-template labels and taints matching its runtime class. The GPU ASG additionally advertises `k8s.io/cluster-autoscaler/node-template/resources/nvidia.com/gpu=1` for scale-from-zero. Verify the running Cluster Autoscaler can describe managed node groups.

The staging ECS template sets `COMMON_OS_PERFORMANCE_RUNTIME_CLASS=commons-staging-performance` and `COMMON_OS_GPU_RUNTIME_CLASS=commons-staging-gpu`; production leaves both unset. CommonOS receives the runtime class with the requested resource specification. Install the runtime classes before testing an upgrade.

Node startup and GPU scheduling can take several minutes from zero. Approval acknowledges a resource request; it does not prove the hardware is ready. Wait for the computer, then check the actual `nvidia-smi` output and framework CUDA availability before claiming acceleration. The managed Python interpreter has its own GNU libraries and data packages; optional framework packages stay in its isolated extension environment.

## Acceptance and cleanup

Use an isolated staging agent, account and disposable credits. Check pending default requests activate nothing; reject and cross-owner reviews fail safely; automatic CPU access never enables GPU; approval is single-use; expired requests and concurrent leases fail; CPU/RAM upgrades retain files and restore their prior profile. Test a real GPU training step only after explicit owner approval in staging. Check the framework reports the actual GPU, and verify resource release, billing boundaries and scaling back toward zero.

As of 2026-10-08 the region's G-instance quota was zero. Quota requests were submitted for 16 GPU vCPUs and 48 standard vCPUs. Live GPU validation remains pending quota approval and owner approval; passing policy tests does not establish GPU execution.
