# URL とは見做されないパターン

## `"type": "code_inline"` となるパターン

```markdown
1. No leading slash in paths, e.g. in `url.parse('http://foo?bar')` pathname is
```
↓↓↓  
```
{
    "type": "inline",
    "tag": "",
    "attrs": null,
    "map": [
        80,
        82
    ],
    "nesting": 0,
    "level": 3,
    "children": [
------------ Omitting ------------
        {
            "type": "code_inline",
            "tag": "code",
            "attrs": null,
            "map": null,
            "nesting": 0,
            "level": 0,
            "children": null,
            "content": "url.parse('http://foo?bar')",
            "markup": "`",
            "info": "",
            "meta": null,
            "block": false,
            "hidden": false
        },
------------ Omitting ------------
    ],
    "content": "No leading slash in paths, e.g. in `url.parse('http://foo?bar')` pathname is\n``, not `/`",
    "markup": "",
    "info": "",
    "meta": null,
    "block": true,
    "hidden": false
},
```

## `"type": "text"`  となるパターン

### 平文

```markdown
- Internal API change. Due to new CM spec requirements, we had to update
  internals. That should not touch ordinary users, but can affect some external
  plugins. If you are plugin developper - see migration guide:
  https://github.com/markdown-it/markdown-it/blob/master/docs/5.0_migration.md.
```
↓↓↓  
```
{
    "type": "inline",
    "tag": "",
    "attrs": null,
    "map": [
        284,
        288
    ],
    "nesting": 0,
    "level": 3,
    "children": [
------------ Omitting ------------
        {
            "type": "text",
            "tag": "",
            "attrs": null,
            "map": null,
            "nesting": 0,
            "level": 0,
            "children": null,
            "content": "https://github.com/markdown-it/markdown-it/blob/master/docs/5.0_migration.md.",
            "markup": "",
            "info": "",
            "meta": null,
            "block": false,
            "hidden": false
        }
    ],
    "content": "Internal API change. Due to new CM spec requirements, we had to update\ninternals. That should not touch ordinary users, but can affect some external\nplugins. If you are plugin developper - see migration guide:\nhttps://github.com/markdown-it/markdown-it/blob/master/docs/5.0_migration.md.",
    "markup": "",
    "info": "",
    "meta": null,
    "block": true,
    "hidden": false
},
```

### `( )` 内

```markdown
(https://azure.microsoft.com/ja-jp/services/devops/)にアクセス  
```
↓↓↓  
```
    {
        "type": "inline",
        "tag": "",
        "attrs": null,
        "map": [
            268,
            269
        ],
        "nesting": 0,
        "level": 1,
        "children": [
            {
                "type": "text",
                "tag": "",
                "attrs": null,
                "map": null,
                "nesting": 0,
                "level": 0,
                "children": null,
                "content": "(https://azure.microsoft.com/ja-jp/services/devops/)にアクセス",
                "markup": "",
                "info": "",
                "meta": null,
                "block": false,
                "hidden": false
            }
        ],
        "content": "(https://azure.microsoft.com/ja-jp/services/devops/)にアクセス",
        "markup": "",
        "info": "",
        "meta": null,
        "block": true,
        "hidden": false
    },
```

### `[ ]( )` の `[ ]` 内

```markdown
[http://wisdom.sakura.ne.jp/programming/c/c42.html](http://wisdom.sakura.ne.jp/programming/c/c42.html)
```
↓↓↓ (`( )` 内 URL テキストは `"type": "link_open"` と見做されるが、`[ ]` 内は `"type": "text"` と扱われる)  
```
{
    "type": "inline",
    "tag": "",
    "attrs": null,
    "map": [
        3,
        4
    ],
    "nesting": 0,
    "level": 1,
    "children": [
        {
            "type": "link_open",
            "tag": "a",
            "attrs": [
                [
                    "href",
                    "http://wisdom.sakura.ne.jp/programming/c/c42.html"
                ]
            ],
            "map": null,
            "nesting": 1,
            "level": 0,
            "children": null,
            "content": "",
            "markup": "",
            "info": "",
            "meta": null,
            "block": false,
            "hidden": false
        },
        {
            "type": "text",
            "tag": "",
            "attrs": null,
            "map": null,
            "nesting": 0,
            "level": 1,
            "children": null,
            "content": "http://wisdom.sakura.ne.jp/programming/c/c42.html",
            "markup": "",
            "info": "",
            "meta": null,
            "block": false,
            "hidden": false
        },
        {
            "type": "link_close",
            "tag": "a",
            "attrs": null,
            "map": null,
            "nesting": -1,
            "level": 0,
            "children": null,
            "content": "",
            "markup": "",
            "info": "",
            "meta": null,
            "block": false,
            "hidden": false
        }
    ],
    "content": "[http://wisdom.sakura.ne.jp/programming/c/c42.html](http://wisdom.sakura.ne.jp/programming/c/c42.html)",
    "markup": "",
    "info": "",
    "meta": null,
    "block": true,
    "hidden": false
},
```
