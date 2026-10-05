# 示例《渡口》的来源和改动

《渡口》是 **烁皓** 为 [shuohao-skills](https://github.com/eternityspring/shuohao-skills) 写的原创样例故事，
Copyright 2026 烁皓，以 [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) 发布。
本目录在该许可下转载和改编，用作 dramazing 的完整示例。

| 文件 | 来源 | 我们做了什么 |
|---|---|---|
| `story.txt` | shuohao-skills `skills/novel-characters/examples/渡口.txt` | 原文照录，未改动 |
| `project.json` | 人物、场景、道具的设定图提示词取自 shuohao-skills 示例产出（`渡口-cast.json`、`渡口-art.json`） | 改成 dramazing 的数据格式；新增外貌短语 `alias`、异样特征 `trait`、环境动态 `ambient`、画风 `style`；新增人物 C05 更夫（原示例大纲提到、人物表里没有） |
| `script.json` | 取自 shuohao-skills 示例剧本 `渡口-script.json` | 改成 dramazing 的数据格式；台词里的破折号改为逗号 |
| `storyboard.json` | 第 1 集以 shuohao-skills 示例分镜 `渡口-storyboard.json` 为起点 | 第 1 集按出片结果改写；第 2 到第 6 集由我们新写；加了站位、运镜、视线、限制等字段 |

以上改动由 dramazing 的作者在 2026 年 10 月完成。

本目录只包含文字数据，不包含用这些数据生成的设定图、分镜图和视频。仓库首页 README 用到的几张展示图在 `assets/showcase/`，社交预览图是 `assets/social-preview.jpg`，都取自本示例的实际产出。
