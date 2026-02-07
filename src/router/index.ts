import { createRouter, createWebHistory } from '@ionic/vue-router';
import HomePage from '../views/HomePage.vue'
import WelcomePage from '@/pages/WelcomePage.vue';
import GalleryPage from '@/pages/GalleryPage.vue';
import GalleryDetailPage from '@/pages/GalleryDetailPage.vue';
import SettingsPage from '@/pages/SettingsPage.vue';
import LibraryPage from '@/pages/LibraryPage.vue';
import BookDetailPage from '@/pages/BookDetailPage.vue';
import MapPage from '@/pages/MapPage.vue';
import WinePage from '@/pages/WinePage.vue';
import WineDetailPage from '@/pages/WineDetailPage.vue';
import RoutesPage from '@/pages/RoutesPage.vue';
import RouteDetailPage from '@/pages/RouteDetailPage.vue';
import ShoppingListPage from '@/pages/ShoppingListPage.vue';
import ShoppingListDetailPage from '@/pages/ShoppingListDetailPage.vue';
import TodoPage from '@/pages/TodoPage.vue';
import TodoDetailPage from '@/pages/TodoDetailPage.vue';
import TodoTaskDetailPage from '@/pages/TodoTaskDetailPage.vue';
import TimelinePage from '@/pages/TimelinePage.vue';


const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes : [
    {path : '/', component: WelcomePage},
    {path : '/settings', component: SettingsPage},
    {path : '/library', component: LibraryPage},
    {path : '/library/book/:id', component: BookDetailPage},
    {path : '/editor-cover', component: () => import('@/pages/EditorCoverPage.vue')},
    {path : '/gallery', component: GalleryPage},
    {path : '/gallery/:id', component: GalleryDetailPage},
    {path : '/gallery/:galleryId/editor', component: () => import('@/pages/EditorPage.vue')},
    {path : '/gallery/:galleryId/video-editor', component: () => import('@/pages/VideoEditorPage.vue')},
    {path : '/timeline', component: TimelinePage},
    {path : '/map',  component: MapPage},
    {path : '/wine', component: WinePage},
    {path : '/wine/:id', component: WineDetailPage},
    {path : '/routes', component: RoutesPage},
    {path : '/routes/:id/record', component: RouteDetailPage},
    {path : '/routes/:id', component: RouteDetailPage},
    {path : '/shopping', component: ShoppingListPage},
    {path : '/shopping/:id', component: ShoppingListDetailPage},
    {path : '/todo', component: TodoPage},
    {path : '/todo/:id', component: TodoDetailPage},
    {path : '/todo/:listId/item/:itemId', component: TodoTaskDetailPage}
    ]
})

export default router
