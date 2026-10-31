// Raiz do app: só o roteador e o aviso de "nova versão disponível".
// O service worker baixa a versão nova em segundo plano; o aviso deixa a pessoa recarregar na hora certa
// (recarregar sozinho poderia apagar um gasto que ela estivesse digitando).
import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    @if (novaVersao()) {
      <div class="faixa-atualizacao">
        Nova versão disponível.
        <button type="button" (click)="atualizar()">Atualizar</button>
      </div>
    }
  `,
})
export class App {
  protected readonly novaVersao = signal(false);

  constructor() {
    const sw = inject(SwUpdate);
    if (!sw.isEnabled) return;
    sw.versionUpdates.subscribe((e) => {
      if (e.type === 'VERSION_READY') this.novaVersao.set(true);
    });
    // Ao voltar para o app (ele fica aberto em segundo plano no celular), procura versão nova.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') sw.checkForUpdate().catch(() => {});
    });
  }

  protected atualizar() {
    document.location.reload();
  }
}
