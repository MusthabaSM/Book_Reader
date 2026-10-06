import React, { createContext, useContext } from 'react';
import type { Resource } from '../../book/models';

interface ResourceContextValue {
    resources: Record<string, Resource>;
}

export const ResourceContext = createContext<ResourceContextValue>({
    resources: {},
});

export const useResources = () => useContext(ResourceContext);

interface Props {
    resources: Record<string, Resource>;
    children: React.ReactNode;
}

export const ResourceProvider: React.FC<Props> = ({ resources, children }) => {
    return (
        <ResourceContext.Provider value={{ resources }}>
            {children}
        </ResourceContext.Provider>
    );
};
