import { createRouter, createWebHistory } from '@ionic/vue-router';


const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes : [
    {path : '/', component: () => import('@/pages/WelcomePage.vue')},
    {path : '/settings', component: () => import('@/pages/SettingsPage.vue')},
    {path : '/library', component: () => import('@/pages/LibraryPage.vue')},
    {path : '/library/categories', component: () => import('@/pages/CategoryManagementPage.vue')},
    {path : '/library/book/:id', component: () => import('@/pages/BookDetailPage.vue')},
    {path : '/editor-cover', component: () => import('@/pages/EditorCoverPage.vue')},
    {path : '/gallery', component: () => import('@/pages/GalleryPage.vue')},
    {path : '/share-target', component: () => import('@/pages/ShareTargetPage.vue')},
    {path : '/gallery/:id', component: () => import('@/pages/GalleryDetailPage.vue')},
    {path : '/gallery/:galleryId/editor', component: () => import('@/pages/EditorPage.vue')},
    {path : '/gallery/:galleryId/video-editor', component: () => import('@/pages/VideoEditorPage.vue')},
    {path : '/image-editor', component: () => import('@/pages/ImageEditorPage.vue')},
    {path : '/timeline', component: () => import('@/pages/TimelinePage.vue')},
    {path : '/video-studio', component: () => import('@/pages/VideoStudioPage.vue')},
    {path : '/map',  component: () => import('@/pages/MapPage.vue')},
    {path : '/wine', component: () => import('@/pages/WinePage.vue')},
    {path : '/wine/:id', component: () => import('@/pages/WineDetailPage.vue')},
    {path : '/routes', component: () => import('@/pages/RoutesPage.vue')},
    {path : '/routes/:id/record', component: () => import('@/pages/RouteDetailPage.vue')},
    {path : '/routes/:id', component: () => import('@/pages/RouteDetailPage.vue')},
    {path : '/shopping', component: () => import('@/pages/ShoppingListPage.vue')},
    {path : '/shopping/:id', component: () => import('@/pages/ShoppingListDetailPage.vue')},
    {path : '/todo', component: () => import('@/pages/TodoPage.vue')},
    {path : '/todo/:id', component: () => import('@/pages/TodoDetailPage.vue')},
    {path : '/todo/:listId/item/:itemId', component: () => import('@/pages/TodoTaskDetailPage.vue')}
    ]
})

export default router
