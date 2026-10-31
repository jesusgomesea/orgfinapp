// Rotas. Ordem dos guards nas telas logadas: primeiro exige login, depois o cadastro inicial.
import { Routes } from '@angular/router';
import { exigeCadastroInicial, exigeLogin } from './nucleo/auth';

export const routes: Routes = [
  { path: 'entrar', loadComponent: () => import('./telas/entrar').then((m) => m.Entrar) },
  {
    path: 'primeiro-acesso',
    canActivate: [exigeLogin],
    loadComponent: () => import('./telas/primeiro-acesso').then((m) => m.PrimeiroAcesso),
  },
  {
    path: '',
    canActivate: [exigeLogin, exigeCadastroInicial],
    loadComponent: () => import('./telas/estrutura').then((m) => m.Estrutura),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'painel' },
      { path: 'painel', loadComponent: () => import('./telas/painel').then((m) => m.Painel) },
      { path: 'calendario', loadComponent: () => import('./telas/calendario').then((m) => m.Calendario) },
      { path: 'gasto/:id', loadComponent: () => import('./telas/gasto').then((m) => m.Gasto) },
      { path: 'cadastros', loadComponent: () => import('./telas/cadastros').then((m) => m.Cadastros) },
    ],
  },
  { path: '**', redirectTo: '' },
];
