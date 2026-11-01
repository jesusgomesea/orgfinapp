// Rotas. Ordem dos guards nas telas logadas: primeiro exige login, depois o cadastro inicial.
// Cada tela é carregada só quando aberta (loadComponent), para o app abrir rápido no celular.
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
      { path: 'fixos', loadComponent: () => import('./telas/fixos').then((m) => m.Fixos) },
      { path: 'cofres', loadComponent: () => import('./telas/cofres').then((m) => m.Cofres) },
      { path: 'fatura/:id', loadComponent: () => import('./telas/fatura').then((m) => m.Fatura) },
      { path: 'relatorios', loadComponent: () => import('./telas/relatorios').then((m) => m.Relatorios) },
      { path: 'assistente', loadComponent: () => import('./telas/assistente').then((m) => m.Assistente) },
      { path: 'retrospectiva', loadComponent: () => import('./telas/retrospectiva').then((m) => m.Retrospectiva) },
      { path: 'mais', loadComponent: () => import('./telas/mais').then((m) => m.Mais) },
      { path: 'cadastros', loadComponent: () => import('./telas/cadastros').then((m) => m.Cadastros) },
    ],
  },
  { path: '**', redirectTo: '' },
];
