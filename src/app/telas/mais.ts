// "Mais" (só no celular/tablet): as telas que não cabem na barra de baixo, em cartões grandes de tocar.
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../nucleo/auth';
import { Icone, NomeIcone } from '../nucleo/icone';

@Component({
  selector: 'app-mais',
  host: { class: 'tela tela-mais' },
  imports: [RouterLink, Icone],
  template: `
    <header class="topo"><h1>Mais</h1></header>
    <nav class="grade-mais" aria-label="Mais opções">
      @for (i of itens; track i.titulo) {
        <a [routerLink]="i.rota" [fragment]="i.ancora" class="opcao-mais" [style.--cor]="i.cor">
          <span class="opcao-icone"><app-icone [nome]="i.icone" /></span>
          <strong>{{ i.titulo }}</strong>
          <small class="suave">{{ i.texto }}</small>
        </a>
      }
    </nav>
    <button type="button" class="largo sair" (click)="sair()"><app-icone nome="sair" /> Sair deste aparelho</button>
  `,
})
export class Mais {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected readonly itens: { rota: string; ancora?: string; icone: NomeIcone; titulo: string; texto: string; cor: string }[] = [
    { rota: '/cofres', icone: 'cofre', titulo: 'Cofres', texto: 'Poupanças e metas', cor: '#cfff04' },
    { rota: '/fixos', icone: 'repetir', titulo: 'Fixos e entradas', texto: 'Contas do mês e dinheiro que entra', cor: '#38bdf8' },
    { rota: '/assistente', icone: 'conversa', titulo: 'Assistente', texto: 'Pergunte sobre seus gastos', cor: '#a78bfa' },
    { rota: '/relatorios', icone: 'grafico', titulo: 'Relatórios', texto: 'Ano, categorias, Excel', cor: '#fb923c' },
    { rota: '/cadastros', icone: 'ajustes', titulo: 'Ajustes', texto: 'Renda, cartões, categorias', cor: '#a1a1aa' },
    { rota: '/cadastros', ancora: 'avisos', icone: 'sino', titulo: 'Avisos', texto: 'Lembrete de vencimento', cor: '#f472b6' },
  ];

  protected sair() {
    if (!confirm('Sair deste aparelho? Vai precisar da senha para entrar de novo.')) return;
    this.auth.sair();
    this.router.navigateByUrl('/entrar');
  }
}
