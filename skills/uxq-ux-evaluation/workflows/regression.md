# 基线与回归比较

```bash
uxq baseline create main <baseline-run-id> --root .uxq --json
uxq baseline list --root .uxq --json
uxq compare <current-run-id> main --root .uxq --json
uxq baseline update main <current-run-id> --reason "已批准的新基线" --root .uxq --json
```

基线按名称持久化在 root/baselines，冻结创建时的指标、规则与评价，不把当前运行复制为历史输入。创建要求已完成并有完整数值评价；更新须明确原因，不自动替用户覆盖基线。

先查看 comparability 和 caveats。策略、定义、执行计划、浏览器、视口等不一致可能导致不可比。NOT_COMPARABLE 不提供可误解的数值 delta，退出非零；不能归因于产品改动。不同主题或视口是不同实验条件，不能无条件横向比较。

所有命令使用相同 --root 和实际 run ID。CLI 没有 regression detect 命令，也不会自动更新主分支基线。
