import 'vant/lib/index.css';
import './styles.css';

import { createPinia } from 'pinia';
import { createApp } from 'vue';

import App from './App.vue';
import router from './router';
import { migrationApi } from './api/migrationApi';
import { storage } from './utils/storage';

void storage.cleanExpired();

const app = createApp(App);

app.use(createPinia());
app.use(router);

// 先把旧的全局混写数据迁到各用户作用域，再挂载业务页面；失败可在界面上重试。
void migrationApi.run().finally(() => {
  app.mount('#app');
});
