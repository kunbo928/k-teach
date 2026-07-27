# 预测队列执行顺序

## 不要先运行

阅读代码，标出同步输出、Promise 回调和定时器回调。

```js
console.log("同步");
setTimeout(() => console.log("定时器"), 0);
Promise.resolve().then(() => console.log("微任务"));
```

## 写出理由

只写顺序不够。说明每次选择下一个任务时，运行时正在检查什么。
