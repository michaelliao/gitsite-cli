```mermaid
---
title: State Diagram Demo
---
stateDiagram-v2
    [*] --> Init
    Init --> Ready
    Ready --> First
    state First {
        [*] --> Second

        state Second {
            [*] --> second
            second --> Third

            state Third {
                [*] --> third
                third --> [*]
            }
        }
    }
    Third --> END
```