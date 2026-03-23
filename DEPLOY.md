# Nginx 部署说明

当前项目已经按 Nginx 静态站点方式整理成下面的结构：

- `portal/index.html`：站点默认首页
- `weiqi/index.html`：围棋游戏页面
- `xiangqi/index.html`：中国象棋游戏页面
- `weiqi/styles.css`：围棋样式
- `weiqi/app.js`：围棋逻辑
- `xiangqi/styles.css`：中国象棋样式
- `xiangqi/app.js`：中国象棋逻辑
- `weiqi/nginx-weiqi.conf`：Nginx 示例配置
- `deploy-nginx.sh`：静态文件部署脚本

## 目标目录结构

部署到 `/usr/share/nginx` 后，目录应为：

```text
/usr/share/nginx/
  portal/
    index.html
  weiqi/
    index.html
    styles.css
    app.js
  xiangqi/
    index.html
    styles.css
    app.js
```

## 默认首页

访问根路径 `/` 时，Nginx 默认返回：

```text
/portal/index.html
```

同时保留下面两个子路径：

- `/portal/`
- `/weiqi/`
- `/xiangqi/`

## 部署静态文件

在项目根目录执行：

```bash
bash ./deploy-nginx.sh
```

如果你想部署到别的目录，可以传目标路径：

```bash
bash ./deploy-nginx.sh /your/static/root
```

## 部署 Nginx 配置

将下面这个文件复制到你的 Nginx 站点配置位置：

- `weiqi/nginx-weiqi.conf`

常见命令示例：

```bash
cp /root/work/weiqi/nginx-weiqi.conf /etc/nginx/conf.d/default.conf
nginx -t
nginx -s reload
```

## 注意事项

- 这套配置要求 `portal` 和 `weiqi` 两个目录同时存在于 Nginx 的 `root` 下
- 这套配置要求 `portal`、`weiqi` 和 `xiangqi` 三个目录同时存在于 Nginx 的 `root` 下
- 围棋页面中的资源路径是相对 `weiqi/` 目录组织的，所以 `styles.css` 和 `app.js` 需要一起部署
- 中国象棋页面中的资源路径是相对 `xiangqi/` 目录组织的，所以 `styles.css` 和 `app.js` 也需要一起部署
- 后续新增小游戏时，推荐继续按 `游戏名/index.html` 的结构放到 `/usr/share/nginx/游戏名/`
