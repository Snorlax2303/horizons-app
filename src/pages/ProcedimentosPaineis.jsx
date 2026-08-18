import React from 'react';
import { Helmet } from 'react-helmet';
import { BookOpen, CheckCircle2, ShieldAlert } from 'lucide-react';

const Field = ({ name, description }) => <div className="rounded-lg border bg-white p-4 dark:bg-gray-800"><p className="font-medium">{name}</p><p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{description}</p></div>;

const StepList = ({ steps }) => <ol className="space-y-3">{steps.map((step, index) => <li key={step} className="flex gap-3 text-sm"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-100 font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{index + 1}</span><span className="pt-0.5">{step}</span></li>)}</ol>;

const procedures = [
  {
    name: 'Unix',
    accent: 'border-sky-300',
    test: ['Usar o fluxo de adicionar cliente e selecionar o servidor e o plano de teste adequados.', 'Registrar o nome usando o ID do cliente e liberar somente 1 tela para o período de teste.', 'Quando houver contratação após teste, manter essa primeira tela e criar apenas as telas adicionais no plano normal.'],
    renewal: ['Localizar o cliente no painel.', 'Selecionar o servidor e o plano definidos para o acesso.', 'Renovar e registrar a validade confirmada.'],
  },
  {
    name: 'Union',
    accent: 'border-violet-300',
    test: ['Em Adicionar cliente, selecionar o servidor Hiper como escolha operacional usual.', 'Escolher Teste Hiper com adultos ou Teste Hiper sem adultos.', 'Descer até Nome, informar o nome com o ID do cliente e liberar 1 tela.', 'Após o teste, se o cliente contratar mais telas, criar os acessos adicionais como usuários comuns no plano normal.'],
    renewal: ['Escolher Hiper como servidor.', 'Selecionar o plano do cliente.', 'Confirmar a renovação e registrar a validade.'],
  },
  {
    name: 'Now',
    accent: 'border-emerald-300',
    test: ['No menu das três barras no alto à direita, abrir Teste e clicar em Adicionar teste.', 'Informar nome, criar um usuário único (padrão sugerido: nome + ID), usar Gerar senha e escolher o perfil com ou sem adultos.', 'Após criar, copiar usuário e senha na lista e enviar ao cliente com o app Blessed e o código N.', 'Para ativar uma conta de teste, usar Tornar cliente. Para venda direta, criar em Clientes com o mesmo preenchimento básico.'],
    renewal: ['No menu das três barras, abrir Clientes.', 'Buscar pelo nome do cliente e clicar em Renovar nas opções.', 'Escolher a quantidade de meses — o padrão é 1 mês — e confirmar Renovar.'],
  },
];

export default function ProcedimentosPaineis() {
  return <>
    <Helmet><title>Procedimentos dos Painéis - Horizons</title></Helmet>
    <div className="space-y-6">
      <div className="flex gap-3"><BookOpen className="mt-1 h-7 w-7 text-indigo-600" /><div><h1 className="text-3xl font-bold">Procedimentos dos Painéis</h1><p className="mt-1 text-gray-600 dark:text-gray-400">Referência operacional para Unix, Union e Now. As decisões de roteamento serão definidas depois no Typebot.</p></div></div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><div className="flex gap-3"><ShieldAlert className="h-5 w-5 shrink-0" /><p>Não armazene senhas nesta aplicação. Copie-as do painel apenas no momento de enviar o teste; o Horizons registra o acesso, seu estado e validade.</p></div></div>

      <section><h2 className="mb-3 text-xl font-semibold">Dados comuns de cada acesso</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Field name="Cliente e ID" description="Cliente vinculado e o ID usado para identificar o acesso no painel." />
        <Field name="Painel e servidor" description="Unix, Union ou Now; conexão e servidor usados na criação." />
        <Field name="Perfil adulto" description="Com adultos ou sem adultos, quando a opção existir no painel." />
        <Field name="Tipo de acesso" description="Teste, contratação direta, teste convertido ou tela adicional." />
        <Field name="Telas e plano" description="Quantidade de telas daquele acesso e plano externo selecionado." />
        <Field name="Status e validade" description="Estado do teste/acesso e a data de expiração ou próxima renovação." />
      </div></section>

      <section><h2 className="mb-3 text-xl font-semibold">Fluxos por painel</h2><div className="grid gap-5 xl:grid-cols-3">{procedures.map((procedure) => <article key={procedure.name} className={`rounded-xl border-t-4 ${procedure.accent} border-x border-b bg-white p-5 shadow-sm dark:bg-gray-800`}><h3 className="text-xl font-bold">{procedure.name}</h3><div className="mt-5"><h4 className="mb-3 flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-green-600" />Criar teste / acesso</h4><StepList steps={procedure.test} /></div><div className="mt-6"><h4 className="mb-3 flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-green-600" />Renovar</h4><StepList steps={procedure.renewal} /></div></article>)}</div></section>

      <p className="text-sm text-gray-500">Próxima etapa: definir no Typebot as regras de escolha de painel, servidor, plano e telas. Até lá, os campos acima permitem registrar a decisão tomada manualmente.</p>
    </div>
  </>;
}
