---
tags: [entity-framework, csharp]
---

## Execução adiada (_deferred execution_)

Essa aqui é o mindset de EF. É importante ter isso em mente para guiar a escrita de consultas em Entity Framework.
O grande ponto do EF é que a consulta que eu escrevo no código é um pedido, não uma consulta naquele momento. No EF tem uma parte de construir antes de pedir. Primeiro vc escreve o "SQL" e depois vem alguns comandos específicos para chamar esse código de consulta.
Mas isso num é exatamente o que eu faço no SQL? Eu tenho que escrever o código, a consulta SQL, antes de rodar. Não escrevo SQL rodando ao mesmo tempo.
E realmente, nesse quesito o EF funciona igual ao SQL: primeiro escreve e roda depois. Mas a questão aqui é que não estamos em um DBeaver ou Workbench, estamos em um código C#, numa linguagem de programação, que está rodando no servidor. O olhar aqui é para o código C#, não para o SQL.
Quando vc roda um código SQL, ou C#, ele faz as operações quando vc chega numa determinada linha, tipo:

```csharp
var total = CalcularTotal();   // rodou agora
var lista = new List<int>();   // criou agora
```

Só que no EF posso me deparar com essa linha aqui:

```csharp
var disponiveis = db.Livros.Where(l => l.Disponivel);
```

Olhando por cima assim, parece que está sendo feita uma consulta em Livros onde cada dado que tem a flag Disponivel está sendo coletado e armazenado em disponiveis. A questão é justamente essa: não está. Mesmo que o código esteja rodando nesse momento, ele não está fazendo nenhuma consulta aí. Se fosse um SQL normal, a consulta estaria acontecendo pq o código estaria rodando.
No EF você pode escrever um SQL sem rodar, montar um SQL enquanto um programa roda. Num DBeaver vc não roda um SQL que será construído enquanto ele roda, vc tem que construir todo o SQL e rodar ele pronto. No EF não precisa disso. Existem comandos EF específicos para ir montando a consulta conforme vai sendo rodado o código C#, e depois posso usar outros comandos para efetivamente fazer a consulta no banco.
Isso é a Execução Adiada. Durante a execução do código vc não precisa ter uma consulta pronta para rodar, vc pode construir ela durante a execução do programa e rodar ainda durante a execução. Com comandos SQL puros vc precisa ter o código SQL pronto para rodar.

## Dicionário de Comandos

Abaixo segue uma lista de comandos que fazem as operações de montar a consulta e os que executam uma consulta.
É importante ter eles em mente ou consultar esse material para lembrar o que cada comando pode fazer. Já que vamos nos tornar revisores de IA, seria interessante conhecer sobre esses comandos para saber se a IA colocou a consulta no lugar certo, se a forma que ela fez num pode degradar a performance de um relatório, por exemplo.

| Ação                | Comandos                           |
| ------------------- | ---------------------------------- |
| Montar a consulta   | Where, OrderBy, Select, Skip, Take |
| Executar a consulta | ToList, First, Count, Any, foreach |

O que o EF faz inclusive tem nome: **execução adiada**.
